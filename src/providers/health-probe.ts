/**
 * Health Probe for Provider Detection
 *
 * Uses unauthenticated /health endpoints to distinguish between providers.
 * Detection is config-driven via EndpointDetectionConfig.healthMatch patterns.
 */

import { secureFetch } from './http.js';
import { logger } from '../services/logger.js';
import { DEFAULT_TIMEOUT_BUDGET_MS, HEALTH_MATCH_WILDCARD } from '../core/constants.js';
import type { EndpointConfigRegistry } from '../types/endpoint-config.js';
import type { ProbeOutcome } from '../core/maintenance-scheduler.js';

/**
 * Extract origin from base URL
 *
 * Strips path components to get the root origin.
 * E.g., https://v2.vexke.com/api → https://v2.vexke.com
 *
 * @param baseUrl - Full base URL
 * @returns Origin (protocol + host) or original URL on parse error
 */
export function extractOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.origin;
  } catch {
    // Invalid URL, return as-is
    return baseUrl;
  }
}

/**
 * Match a health response against endpoint config healthMatch patterns
 *
 * Iterates configs sorted by specificity (more fields = more specific).
 * Matching rules:
 * - "*" = field must exist as string
 * - otherwise = exact value match
 *
 * @param data - Parsed health response JSON
 * @param endpointConfigs - Endpoint config registry
 * @returns Provider ID of first match, or null if none match
 */
export function matchHealthResponse(
  data: Record<string, unknown>,
  endpointConfigs: EndpointConfigRegistry
): string | null {
  const candidates = Object.entries(endpointConfigs).reduce<Array<{
    providerId: string;
    healthMatch: Record<string, string>;
  }>>((acc, [providerId, config]) => {
    const healthMatch = config.detection?.healthMatch;
    if (healthMatch != null && Object.keys(healthMatch).length > 0) {
      acc.push({ providerId, healthMatch });
    }
    return acc;
  }, []);

  // Sort by specificity: more fields first; alphabetical tiebreaker for determinism
  candidates.sort((a, b) => {
    const diff = Object.keys(b.healthMatch).length - Object.keys(a.healthMatch).length;
    return diff !== 0 ? diff : a.providerId.localeCompare(b.providerId);
  });

  for (const { providerId, healthMatch } of candidates) {
    const matches = Object.entries(healthMatch).every(([field, expected]) => {
      const actual = data[field];
      if (expected === HEALTH_MATCH_WILDCARD) {
        return typeof actual === 'string';
      }
      return actual === expected;
    });

    if (matches) {
      return providerId;
    }
  }

  return null;
}

/**
 * Probe /health endpoint to detect provider
 *
 * Fetches GET {origin}/health and matches response against endpointConfigs'
 * detection.healthMatch patterns. Returns null on any failure or no match.
 *
 * @param baseUrl - Base URL to probe
 * @param timeoutMs - Request timeout in milliseconds (default: DEFAULT_TIMEOUT_BUDGET_MS)
 * @param endpointConfigs - Endpoint config registry for health response matching
 * @returns Provider ID or null on failure/no match
 */
export async function probeHealth(
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_BUDGET_MS,
  endpointConfigs: EndpointConfigRegistry = {}
): Promise<string | null> {
  const origin = extractOrigin(baseUrl);
  const healthUrl = `${origin}/health`;

  logger.debug('Probing health endpoint', { healthUrl, timeoutMs });

  try {
    const responseText = await secureFetch(
      healthUrl,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      timeoutMs
    );

    // Parse JSON
    const data = JSON.parse(responseText) as Record<string, unknown>;
    logger.debug('Health probe response', { data });

    const matched = matchHealthResponse(data, endpointConfigs);
    if (matched) {
      logger.debug('Detected provider from health response', { provider: matched });
      return matched;
    }

    // Unknown health response pattern
    logger.debug('Health probe returned unrecognized pattern', { data });
    return null;
  } catch (error: unknown) {
    logger.debug('Health probe failed', { error: String(error) });
    return null;
  }
}

/**
 * Probe /health endpoint and return a rich outcome for the maintenance scheduler
 *
 * Wraps probeHealth with timing and structures the result as ProbeOutcome.
 *
 * @param baseUrl - Base URL to probe
 * @param timeoutMs - Request timeout in milliseconds
 * @param endpointConfigs - Endpoint config registry for health response matching
 * @returns ProbeOutcome with success flag, matched provider, and response time
 */
export async function probeHealthWithMetrics(
  baseUrl: string,
  timeoutMs: number,
  endpointConfigs: EndpointConfigRegistry
): Promise<ProbeOutcome> {
  const start = Date.now();
  const matchedProvider = await probeHealth(baseUrl, timeoutMs, endpointConfigs);
  return {
    success: matchedProvider !== null,
    matchedProvider,
    responseTimeMs: Date.now() - start,
  };
}
