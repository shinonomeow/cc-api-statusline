/**
 * Cache Schema
 *
 * Disk cache format with validity rules and error state tracking.
 */

import type { NormalizedUsage } from './normalized-usage.js';

/**
 * Cache format version - increment when schema changes
 */
export const CACHE_VERSION = 1;

/**
 * Error state for polling engine
 */
export interface ErrorState {
  code: 'auth' | 'network' | 'timeout' | 'quota' | 'unknown';
  message: string;
  timestamp: string; // ISO-8601 UTC
  retryCount: number;
}

/**
 * Cache entry stored on disk
 *
 * Validity requires ALL of:
 * 1. TTL not expired (fetchedAt + TTL > now)
 * 2. Provider matches current env
 * 3. Base URL matches current env (via tokenHash)
 * 4. Version matches CACHE_VERSION
 * 5. Token hash matches current env token
 */
export interface CacheEntry {
  version: number; // CACHE_VERSION
  provider: string; // e.g. "sub2api", must match current provider
  baseUrl: string; // ANTHROPIC_BASE_URL, for display/debug
  tokenHash: string; // sha256(ANTHROPIC_AUTH_TOKEN)[0:12], detects token changes
  configHash: string; // sha256(raw config file bytes), for fast-path configHash check

  data: NormalizedUsage; // Normalized usage data
  renderedLine: string; // Pre-rendered statusline for fast piped mode (Path A)

  fetchedAt: string; // ISO-8601 UTC timestamp
  ttlSeconds: number; // Cache TTL, typically pollIntervalSeconds

  errorState: ErrorState | null; // Last error, if any
}

/**
 * Cache TTL (time-to-live) in seconds
 * This should match pollIntervalSeconds from config, but has a default
 */
export const DEFAULT_CACHE_TTL_SECONDS = 30;

/**
 * Type guard for CacheEntry
 */
export function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;

  return (
    typeof c['version'] === 'number' &&
    typeof c['provider'] === 'string' &&
    typeof c['baseUrl'] === 'string' &&
    typeof c['tokenHash'] === 'string' &&
    typeof c['configHash'] === 'string' &&
    typeof c['data'] === 'object' &&
    c['data'] !== null &&
    typeof c['renderedLine'] === 'string' &&
    typeof c['fetchedAt'] === 'string' &&
    typeof c['ttlSeconds'] === 'number' &&
    (c['errorState'] === null || typeof c['errorState'] === 'object')
  );
}
