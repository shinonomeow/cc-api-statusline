/**
 * Disk Cache Service
 *
 * Atomic writes, TTL validation, per-terminal isolation
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CacheEntry, EnvSnapshot, Config, ProviderDetectionCacheEntry } from '../types/index.js';
import { CACHE_VERSION, isCacheEntry, isProviderDetectionCacheEntry } from '../types/index.js';
import { shortHash } from './hash.js';
import { ensureDir } from './ensure-dir.js';
import { atomicWriteFile } from './atomic-write.js';
import { logger } from './logger.js';

/**
 * Get cache directory path
 */
export function getCacheDir(): string {
  const override = process.env['CC_API_STATUSLINE_CACHE_DIR'];
  if (override) {
    return override;
  }
  return join(homedir(), '.claude', 'cc-api-statusline');
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  const dir = getCacheDir();
  ensureDir(dir);
}

/**
 * Get cache file path for a specific base URL
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @returns Path to cache file (cache-<hash>.json)
 */
export function getCachePath(baseUrl: string): string {
  const hash = shortHash(baseUrl, 12);
  return join(getCacheDir(), `cache-${hash}.json`);
}

/**
 * Read cache file
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @returns Cache entry or null if not found/invalid
 */
export function readCache(baseUrl: string): CacheEntry | null {
  const path = getCachePath(baseUrl);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content) as unknown;

    // Validate structure
    if (!isCacheEntry(data)) {
      logger.warn(`Invalid cache structure at ${path}`);
      return null;
    }

    return data;
  } catch (error: unknown) {
    logger.warn(`Failed to read cache from ${path}: ${error}`);
    return null;
  }
}

/**
 * Write cache file (atomic)
 *
 * Uses .tmp + rename for atomicity. Fire-and-forget - never throws.
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @param entry - Cache entry to write
 */
export function writeCache(baseUrl: string, entry: CacheEntry): void {
  const path = getCachePath(baseUrl);

  try {
    ensureCacheDir();

    // Serialize
    const content = JSON.stringify(entry, null, 2);

    // Write atomically
    atomicWriteFile(path, content);
  } catch (error: unknown) {
    logger.warn(`Failed to write cache to ${path}: ${error}`);
  }
}

/**
 * Check if cache is valid
 *
 * All 5 conditions must be true:
 * 1. TTL not expired
 * 2. Provider matches
 * 3. Base URL matches
 * 4. Version matches
 * 5. Token hash matches
 *
 * @param entry - Cache entry
 * @param currentEnv - Current environment snapshot
 * @returns true if cache is valid
 */
export function isCacheValid(
  entry: CacheEntry,
  currentEnv: EnvSnapshot
): boolean {
  // 1. TTL check
  const fetchedAt = new Date(entry.fetchedAt).getTime();
  const now = Date.now();
  const age = now - fetchedAt;
  const ttlMs = entry.ttlSeconds * 1000;

  if (age >= ttlMs) {
    return false;
  }

  // 2. Provider match (requires provider to be resolved)
  // This check is done externally when provider is known

  // 3. Base URL match
  if (entry.baseUrl !== currentEnv.baseUrl) {
    return false;
  }

  // 4. Version match
  if (entry.version !== CACHE_VERSION) {
    return false;
  }

  // 5. Token hash match
  if (entry.tokenHash !== currentEnv.tokenHash) {
    return false;
  }

  return true;
}

/**
 * Check if cache provider matches current provider
 *
 * Separate check because provider resolution happens after cache read
 *
 * @param entry - Cache entry
 * @param currentProvider - Current provider ID
 * @returns true if provider matches
 */
export function isCacheProviderValid(
  entry: CacheEntry,
  currentProvider: string
): boolean {
  return entry.provider === currentProvider;
}

/**
 * Check if cached renderedLine is usable (piped fast path)
 *
 * Requires: cache is valid AND configHash matches
 *
 * @param entry - Cache entry
 * @param currentConfigHash - SHA-256 hash of current raw config file bytes
 * @returns true if renderedLine can be used as-is
 */
export function isCacheRenderedLineUsable(
  entry: CacheEntry,
  currentConfigHash: string
): boolean {
  return entry.configHash === currentConfigHash;
}

/**
 * Compute configHash from raw config file bytes
 *
 * Used for fast-path validation without parsing config.
 * Returns sentinel hash for missing config file.
 *
 * @param configPath - Path to config file
 * @returns SHA-256 hash (first 12 chars) or sentinel for missing file
 */
export function computeConfigHash(configPath: string): string {
  if (!existsSync(configPath)) {
    // Sentinel hash for missing config file
    return shortHash('', 12);
  }

  try {
    const bytes = readFileSync(configPath);
    return shortHash(bytes.toString('utf-8'), 12);
  } catch (error: unknown) {
    logger.warn(`Failed to read config for hash: ${error}`);
    return shortHash('', 12);
  }
}

/**
 * @internal — test-only
 *
 * Get cache age in seconds
 *
 * @param entry - Cache entry
 * @returns Age in seconds, or null if invalid timestamp
 */
export function getCacheAge(entry: CacheEntry): number | null {
  try {
    const fetchedAt = new Date(entry.fetchedAt).getTime();

    // Check if date is invalid (NaN)
    if (isNaN(fetchedAt)) {
      return null;
    }

    const now = Date.now();
    return Math.floor((now - fetchedAt) / 1000);
  } catch {
    return null;
  }
}

/**
 * Default poll interval in seconds
 */
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

/**
 * Compute effective poll interval from config and env override
 *
 * Used to determine cache TTL. Env override takes precedence over config value.
 *
 * @param config - Config object
 * @param envOverride - CC_STATUSLINE_POLL env variable value
 * @returns Effective poll interval in seconds (minimum 5)
 */
export function getEffectivePollInterval(
  config: Config,
  envOverride: number | null
): number {
  // Env override takes precedence
  if (envOverride !== null) {
    return Math.max(5, envOverride);
  }

  // Use config value
  const fromConfig = config.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
  return Math.max(5, fromConfig);
}

/**
 * Get provider detection cache file path for a specific base URL
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @returns Path to provider detection cache file (provider-detect-<hash>.json)
 */
export function getProviderDetectionCachePath(baseUrl: string): string {
  const hash = shortHash(baseUrl, 12);
  return join(getCacheDir(), `provider-detect-${hash}.json`);
}

/**
 * Read provider detection cache file
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @returns Cache entry or null if not found/invalid/expired
 */
export function readProviderDetectionCache(baseUrl: string): ProviderDetectionCacheEntry | null {
  const path = getProviderDetectionCachePath(baseUrl);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content) as unknown;

    // Validate structure
    if (!isProviderDetectionCacheEntry(data)) {
      logger.warn(`Invalid provider detection cache structure at ${path}`);
      return null;
    }

    // Check TTL
    const detectedAt = new Date(data.detectedAt).getTime();
    const now = Date.now();
    const age = now - detectedAt;
    const ttlMs = data.ttlSeconds * 1000;

    if (age >= ttlMs) {
      // Expired, delete silently
      try {
        unlinkSync(path);
      } catch {
        // Ignore deletion errors
      }
      return null;
    }

    return data;
  } catch (error: unknown) {
    logger.warn(`Failed to read provider detection cache from ${path}: ${error}`);
    return null;
  }
}

/**
 * Write provider detection cache file (atomic)
 *
 * Uses .tmp + rename for atomicity. Fire-and-forget - never throws.
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @param entry - Provider detection cache entry to write
 */
export function writeProviderDetectionCache(baseUrl: string, entry: ProviderDetectionCacheEntry): void {
  const path = getProviderDetectionCachePath(baseUrl);

  try {
    ensureCacheDir();

    // Serialize
    const content = JSON.stringify(entry, null, 2);

    // Write atomically
    atomicWriteFile(path, content);
  } catch (error: unknown) {
    logger.warn(`Failed to write provider detection cache to ${path}: ${error}`);
  }
}
