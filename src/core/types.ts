/**
 * Core execution types
 *
 * Pure data structures for execution context and results.
 * No process.* references.
 */

import type { EnvSnapshot, Config, CacheEntry } from '../types/index.js';
import type { EndpointLockEntry } from '../services/endpoint-lock.js';
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

  /** Endpoint config hash from computeEndpointConfigHash() */
  endpointConfigHash: string;

  /** Endpoint lock entry from readEndpointLock() (null if no lock file) */
  endpointLock: EndpointLockEntry | null;

  /** Cached entry (null if no cache) */
  cachedEntry: CacheEntry | null;

  /** Resolved provider ID from resolveProvider() */
  providerId: string;

  /** Provider adapter from getProvider() */
  provider: ProviderAdapter;

  /** Timeout budget in milliseconds (piped: budget, TTY: budget*2) */
  timeoutBudgetMs: number;

  /** Process start time (Date.now()) */
  startTime: number;

  /** Fetch timeout in milliseconds (capped by budget - headroom) */
  fetchTimeoutMs: number;
}

/**
 * Execution path taken by executeCycle
 *
 * A = fast cached renderedLine
 * B = re-render from cached data (config changed)
 * B2 = endpoint config changed (locked out)
 * C = fresh fetch
 * D = fallback (timeout or error)
 */
export type ExecutionPath = 'A' | 'B' | 'B2' | 'C' | 'D';

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

  /** Signal to invalidate provider detection cache (memory + disk) */
  invalidateProvider: boolean;

  /** Execution path taken */
  path: ExecutionPath;
}
