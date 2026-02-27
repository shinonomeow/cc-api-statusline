/**
 * Provider Autodetection
 *
 * Health probe + URL-pattern based provider detection with multi-tier caching
 */

import type { CustomProviderConfig } from '../types/index.js';
import { probeHealth } from './health-probe.js';
import {
  readProviderDetectionCache,
  writeProviderDetectionCache,
} from '../services/cache.js';
import { PROVIDER_DETECTION_TTL_SECONDS } from '../types/index.js';
import { logger } from '../services/logger.js';

/**
 * Detection cache entry
 */
interface DetectionCacheEntry {
  provider: string;
  detectedAt: string;
}

/**
 * In-memory detection cache
 * Key: baseUrl, Value: { provider, detectedAt }
 */
const detectionCache = new Map<string, DetectionCacheEntry>();

/**
 * Detect provider from base URL using URL pattern matching
 *
 * Priority:
 * 1. Custom providers (check urlPatterns)
 * 2. Built-in providers (URL pattern match for distinctive endpoints)
 * 3. Default to sub2api
 *
 * @param baseUrl - ANTHROPIC_BASE_URL value
 * @param customProviders - Custom provider configs from config
 * @returns Provider ID
 */
export function detectProviderFromUrlPattern(
  baseUrl: string,
  customProviders: Record<string, CustomProviderConfig> = {}
): string {
  // Normalize URL for comparison (lowercase, remove trailing slash)
  const normalizedUrl = baseUrl.toLowerCase().replace(/\/$/, '');

  // Check custom providers first (only if they have urlPatterns)
  for (const [providerId, config] of Object.entries(customProviders)) {
    // urlPatterns is optional per spec
    if (config.urlPatterns && config.urlPatterns.length > 0) {
      for (const pattern of config.urlPatterns) {
        const normalizedPattern = pattern.toLowerCase();

        // Substring match
        if (normalizedUrl.includes(normalizedPattern)) {
          return providerId;
        }
      }
    }
  }

  // Check built-in providers (only distinctive URL patterns, not domain names)
  // Note: Domain-based detection removed in favor of health probe
  if (
    normalizedUrl.includes('/apistats') ||
    normalizedUrl.includes('/api/user-stats')
  ) {
    return 'claude-relay-service';
  }

  // Default to sub2api (most common)
  return 'sub2api';
}

/**
 * Resolve provider with multi-tier caching
 *
 * Detection priority:
 * 1. Explicit override (CC_STATUSLINE_PROVIDER) - immediate return
 * 2. In-memory cache - return if hit
 * 3. Disk cache - return if hit and TTL valid
 * 4. Custom provider URL patterns - cache and return
 * 5. Health probe - cache (memory + disk) and return
 * 6. Built-in URL pattern fallback - cache and return
 * 7. Default to sub2api
 *
 * @param baseUrl - ANTHROPIC_BASE_URL value
 * @param providerOverride - CC_STATUSLINE_PROVIDER env override
 * @param customProviders - Custom provider configs
 * @param probeTimeoutMs - Health probe timeout in milliseconds
 * @returns Provider ID
 */
export async function resolveProvider(
  baseUrl: string,
  providerOverride: string | null,
  customProviders: Record<string, CustomProviderConfig> = {},
  probeTimeoutMs: number = 1500
): Promise<string> {
  // 1. Explicit override takes precedence
  if (providerOverride) {
    logger.debug('Provider override detected', { provider: providerOverride });
    return providerOverride;
  }

  // 2. Check in-memory cache
  const cached = detectionCache.get(baseUrl);
  if (cached) {
    logger.debug('Provider detection cache hit (memory)', { provider: cached.provider });
    return cached.provider;
  }

  // 3. Check disk cache
  const diskCached = readProviderDetectionCache(baseUrl);
  if (diskCached) {
    logger.debug('Provider detection cache hit (disk)', {
      provider: diskCached.provider,
      detectedVia: diskCached.detectedVia,
    });
    // Populate in-memory cache
    detectionCache.set(baseUrl, {
      provider: diskCached.provider,
      detectedAt: diskCached.detectedAt,
    });
    return diskCached.provider;
  }

  // 4. Check custom provider URL patterns
  for (const [providerId, config] of Object.entries(customProviders)) {
    if (config.urlPatterns && config.urlPatterns.length > 0) {
      const normalizedUrl = baseUrl.toLowerCase().replace(/\/$/, '');
      for (const pattern of config.urlPatterns) {
        const normalizedPattern = pattern.toLowerCase();
        if (normalizedUrl.includes(normalizedPattern)) {
          logger.debug('Provider detected via custom URL pattern', { provider: providerId, pattern });
          // Cache detection
          cacheProviderDetection(baseUrl, providerId, 'url-pattern');
          return providerId;
        }
      }
    }
  }

  // 5. Health probe
  logger.debug('Attempting health probe', { baseUrl, timeoutMs: probeTimeoutMs });
  const probedProvider = await probeHealth(baseUrl, probeTimeoutMs);
  if (probedProvider) {
    logger.debug('Provider detected via health probe', { provider: probedProvider });
    // Cache detection
    cacheProviderDetection(baseUrl, probedProvider, 'health-probe');
    return probedProvider;
  }

  // 6. Built-in URL pattern fallback
  const patternProvider = detectProviderFromUrlPattern(baseUrl, {});
  logger.debug('Provider detected via built-in URL pattern', { provider: patternProvider });
  cacheProviderDetection(baseUrl, patternProvider, 'url-pattern');
  return patternProvider;
}

/**
 * Cache provider detection result in both memory and disk
 */
function cacheProviderDetection(
  baseUrl: string,
  provider: string,
  detectedVia: 'health-probe' | 'url-pattern' | 'override'
): void {
  const now = new Date().toISOString();

  // In-memory cache
  detectionCache.set(baseUrl, {
    provider,
    detectedAt: now,
  });

  // Disk cache
  writeProviderDetectionCache(baseUrl, {
    baseUrl,
    provider,
    detectedVia,
    detectedAt: now,
    ttlSeconds: PROVIDER_DETECTION_TTL_SECONDS,
  });
}

/**
 * Invalidate detection cache for a specific base URL
 *
 * Used when base URL changes or provider detection should be re-run
 */
export function invalidateDetectionCache(baseUrl: string): void {
  detectionCache.delete(baseUrl);
}

/**
 * Clear entire detection cache
 */
export function clearDetectionCache(): void {
  detectionCache.clear();
}

/**
 * Get cache size (for debugging)
 */
export function getDetectionCacheSize(): number {
  return detectionCache.size;
}
