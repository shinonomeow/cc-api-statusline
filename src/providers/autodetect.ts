/**
 * Provider Autodetection
 *
 * Health probe based provider detection with multi-tier caching.
 * Detection is config-driven via EndpointDetectionConfig.healthMatch patterns.
 */

import type { EndpointConfigRegistry } from '../types/endpoint-config.js';
import { probeHealth } from './health-probe.js';
import {
  readProviderDetectionCache,
  writeProviderDetectionCache,
} from '../services/cache.js';
import { logger } from '../services/logger.js';
import { DEFAULT_TIMEOUT_BUDGET_MS, DETECTION_TTL_BASE_S } from '../core/constants.js';

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
 * Resolve provider with multi-tier caching
 *
 * Detection priority:
 * 1. Explicit override (CC_STATUSLINE_PROVIDER) - immediate return
 * 2. In-memory cache - return if hit
 * 3. Disk cache - return if hit and TTL valid
 * 4. Health probe (config-driven via healthMatch) - cache (memory + disk) and return
 * 5. Default to sub2api
 *
 * @param baseUrl - ANTHROPIC_BASE_URL value
 * @param providerOverride - CC_STATUSLINE_PROVIDER env override
 * @param endpointConfigs - Endpoint config registry
 * @param probeTimeoutMs - Health probe timeout in milliseconds
 * @returns Provider ID
 */
export async function resolveProvider(
  baseUrl: string,
  providerOverride: string | null,
  endpointConfigs: EndpointConfigRegistry = {},
  probeTimeoutMs: number = DEFAULT_TIMEOUT_BUDGET_MS
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

  // 4. Health probe (config-driven)
  logger.debug('Attempting health probe', { baseUrl, timeoutMs: probeTimeoutMs });
  const probedProvider = await probeHealth(baseUrl, probeTimeoutMs, endpointConfigs);
  if (probedProvider) {
    logger.debug('Provider detected via health probe', { provider: probedProvider });
    cacheProviderDetection(baseUrl, probedProvider, 'health-probe');
    return probedProvider;
  }

  // 5. Default to sub2api
  logger.debug('Health probe failed, defaulting to sub2api');
  cacheProviderDetection(baseUrl, 'sub2api', 'health-probe');
  return 'sub2api';
}

/**
 * Cache provider detection result in both memory and disk
 */
function cacheProviderDetection(
  baseUrl: string,
  provider: string,
  detectedVia: 'health-probe' | 'override',
  ttlSeconds: number = DETECTION_TTL_BASE_S
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
    ttlSeconds,
  });
}

/**
 * Cache provider detection result with a dynamically computed TTL
 *
 * Used by the maintenance scheduler after a proactive health probe.
 * Updates both in-memory and disk caches.
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @param provider - Detected provider ID
 * @param ttlSeconds - Dynamic TTL computed by computeDynamicDetectionTtl
 */
export function cacheProviderDetectionWithTtl(
  baseUrl: string,
  provider: string,
  ttlSeconds: number
): void {
  cacheProviderDetection(baseUrl, provider, 'health-probe', ttlSeconds);
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
