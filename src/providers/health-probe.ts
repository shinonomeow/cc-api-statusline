/**
 * Health Probe for Provider Detection
 *
 * Uses unauthenticated /health endpoints to distinguish between providers:
 * - sub2api: {"status": "ok"}
 * - claude-relay-service: {"status": "healthy", "service": "claude-relay-service", ...}
 */

import { secureFetch } from './http.js';
import { logger } from '../services/logger.js';

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
 * Probe /health endpoint to detect provider
 *
 * Fetches GET {origin}/health and analyzes response shape:
 * - If response has "service" field, return its value (e.g., "claude-relay-service")
 * - If response is {"status": "ok"} without "service", return "sub2api"
 * - On any failure (timeout, network, non-JSON), return null
 *
 * @param baseUrl - Base URL to probe
 * @param timeoutMs - Request timeout in milliseconds (default: 1500)
 * @returns Provider ID or null on failure
 */
export async function probeHealth(
  baseUrl: string,
  timeoutMs: number = 1500
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

    // Check for "service" field (relay pattern)
    if (typeof data['service'] === 'string') {
      logger.debug('Detected provider from service field', { provider: data['service'] });
      return data['service'];
    }

    // Check for {"status": "ok"} pattern (sub2api)
    if (data['status'] === 'ok') {
      logger.debug('Detected sub2api from status: ok pattern');
      return 'sub2api';
    }

    // Unknown health response pattern
    logger.debug('Health probe returned unrecognized pattern', { data });
    return null;
  } catch (error: unknown) {
    logger.debug('Health probe failed', { error: String(error) });
    return null;
  }
}
