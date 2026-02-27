/**
 * Provider Autodetection
 *
 * URL-pattern based provider detection with in-memory caching
 */

import type { CustomProviderConfig } from '../types/index.js';

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
 * 2. Built-in providers (URL pattern match)
 * 3. Default to sub2api
 *
 * @param baseUrl - ANTHROPIC_BASE_URL value
 * @param customProviders - Custom provider configs from config
 * @returns Provider ID
 */
export function detectProvider(
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

  // Check built-in providers
  // claude-relay-service: look for /apiStats in URL or known relay domains
  if (
    normalizedUrl.includes('/apistats') ||
    normalizedUrl.includes('relay') ||
    normalizedUrl.includes('/api/user-stats') ||
    normalizedUrl.includes('vexke.com') ||      // Known relay domain
    normalizedUrl.includes('claude-relay') ||    // Common naming pattern
    normalizedUrl.includes('clauderelay')        // Common naming pattern
  ) {
    return 'claude-relay-service';
  }

  // Default to sub2api (most common)
  return 'sub2api';
}

/**
 * Resolve provider with caching
 *
 * Checks cache first, then falls back to detection.
 * Cache is per base URL.
 *
 * @param baseUrl - ANTHROPIC_BASE_URL value
 * @param providerOverride - CC_STATUSLINE_PROVIDER env override
 * @param customProviders - Custom provider configs
 * @returns Provider ID
 */
export function resolveProvider(
  baseUrl: string,
  providerOverride: string | null,
  customProviders: Record<string, CustomProviderConfig> = {}
): string {
  // Explicit override takes precedence
  if (providerOverride) {
    return providerOverride;
  }

  // Check cache
  const cached = detectionCache.get(baseUrl);
  if (cached) {
    return cached.provider;
  }

  // Detect and cache
  const provider = detectProvider(baseUrl, customProviders);
  detectionCache.set(baseUrl, {
    provider,
    detectedAt: new Date().toISOString(),
  });

  return provider;
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
