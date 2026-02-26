/**
 * Core execution types
 *
 * Pure data structures for execution context and results.
 * No process.* references.
 */

import type { EnvSnapshot, Config, CacheEntry } from '../types/index.js';
import type { ProviderAdapter } from '../providers/index.js';

/**
 * Execution context for a single cycle
 *
 * Contains all inputs needed for the execution decision logic.
 */
export interface ExecutionContext {
  /** Environment snapshot from readCurrentEnv() */
  env: EnvSnapshot;

  /** Loaded config from loadConfig() */
  config: Config;

  /** Config hash from computeConfigHash() */
  configHash: string;

  /** Cached entry (null if no cache) */
  cachedEntry: CacheEntry | null;

  /** Resolved provider ID from resolveProvider() */
  providerId: string;

  /** Provider adapter from getProvider() */
  provider: ProviderAdapter;

  /** Timeout budget in milliseconds (widget: 1000ms, direct: 10000ms) */
  timeoutBudgetMs: number;

  /** Process start time (Date.now()) */
  startTime: number;

  /** Fetch timeout in milliseconds (widget: 800ms, direct: 10000ms) */
  fetchTimeoutMs: number;
}

/**
 * Execution result
 *
 * Contains outputs from execution cycle.
 */
export interface ExecutionResult {
  /** Output to write to stdout */
  output: string;

  /** Exit code (0 = success, 1 = error) */
  exitCode: number;

  /** Cache update (non-null = writeCache()) */
  cacheUpdate: CacheEntry | null;
}
