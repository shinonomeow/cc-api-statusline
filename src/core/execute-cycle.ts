/**
 * Core execution cycle
 *
 * Pure business logic for statusline execution.
 * Contains 4-path decision tree:
 * - Path A: cached renderedLine usable
 * - Path B: cache data valid but renderedLine stale
 * - Path C: cache stale/missing → fetch
 * - Path D: fallback (timeout or error)
 */

import type { ExecutionContext, ExecutionResult } from './types.js';
import { isCacheValid, isCacheProviderValid, isCacheRenderedLineUsable, getEffectivePollInterval } from '../services/cache.js';
import { renderStatusline } from '../renderer/index.js';
import { renderError, type ErrorState } from '../renderer/error.js';
import type { CacheEntry } from '../types/index.js';
import { CACHE_VERSION } from '../types/index.js';
import { logger } from '../services/logger.js';
import { EXIT_BUFFER_MS } from './constants.js';
import { classifyFetchError } from './error-classifier.js';

/**
 * Execute a single statusline cycle
 *
 * Pure function - no side effects (no stdout, no exit, no writeCache).
 * Returns data for caller to apply.
 *
 * @param ctx - Execution context
 * @returns Execution result with output, exit code, and optional cache update
 */
export async function executeCycle(ctx: ExecutionContext): Promise<ExecutionResult> {
  const { env, config, configHash, endpointConfigHash, endpointLock, cachedEntry, providerId, provider, timeoutBudgetMs, startTime, fetchTimeoutMs } = ctx;

  // Path A: Fast path - cached renderedLine usable
  // Requires: cache valid + configHash match + endpointConfigHash match + provider match + endpoint config locked
  if (cachedEntry) {
    if (isCacheValid(cachedEntry, env) && isCacheProviderValid(cachedEntry, providerId)) {
      if (cachedEntry.renderedLine
          && isCacheRenderedLineUsable(cachedEntry, configHash)
          && cachedEntry.endpointConfigHash === endpointConfigHash) {
        // Fast path: return cached rendered line
        logger.debug('Path A: Fast path (cached renderedLine)', {
          cacheAge: `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s`
        });
        return {
          output: cachedEntry.renderedLine,
          exitCode: 0,
          cacheUpdate: null,
          invalidateProvider: false,
          path: 'A',
        };
      }
    }
  }

  // Path B2: Endpoint config changed (lock file hash mismatch)
  // Show warning and serve from cache (do NOT fetch with new config)
  if (endpointLock && endpointLock.hash !== endpointConfigHash) {
    logger.debug('Path B2: Endpoint config changed (locked out)', {
      lockedHash: endpointLock.hash,
      currentHash: endpointConfigHash
    });

    // If we have valid cache, show it with warning
    if (cachedEntry && isCacheValid(cachedEntry, env) && isCacheProviderValid(cachedEntry, providerId)) {
      const statusline = renderStatusline(cachedEntry.data, config);
      return {
        output: statusline,
        exitCode: 0,
        cacheUpdate: null, // Don't update cache - keep old endpoint hash
        invalidateProvider: false,
        path: 'B2',
      };
    }

    // No valid cache - show warning message
    const errorOutput = renderError('endpoint-config-changed', 'without-cache');
    return {
      output: errorOutput,
      exitCode: 0,
      cacheUpdate: null,
      invalidateProvider: false,
      path: 'B2',
    };
  }

  // Path B: Cache data valid but renderedLine stale → re-render
  if (cachedEntry && isCacheValid(cachedEntry, env) && isCacheProviderValid(cachedEntry, providerId)) {
    // Re-render from cached data
    logger.debug('Path B: Re-render (config changed, cache data valid)');
    const statusline = renderStatusline(cachedEntry.data, config);

    // Update cache with new renderedLine, configHash, and endpointConfigHash
    const updatedEntry: CacheEntry = {
      ...cachedEntry,
      renderedLine: statusline,
      configHash,
      endpointConfigHash,
    };

    return {
      output: statusline,
      exitCode: 0,
      cacheUpdate: updatedEntry,
      invalidateProvider: false,
      path: 'B',
    };
  }

  // Path C: Cache stale/missing → fetch within deadline
  // Calculate deadline and remaining budget
  const deadline = startTime + timeoutBudgetMs - EXIT_BUFFER_MS;
  const remainingBudget = deadline - Date.now();

  // Guard: insufficient time budget
  if (remainingBudget <= 50) {
    // Path D1: Timeout fallback - show error instead of stale data
    logger.debug('Path D1: Timeout fallback', { remainingBudget });
    const errorOutput = renderError('timeout', 'without-cache', providerId);
    return {
      output: errorOutput,
      exitCode: 0,
      cacheUpdate: null,
      invalidateProvider: false,
      path: 'D',
    };
  }

  // Fetch from provider
  try {
    const baseUrl = env.baseUrl;
    const authToken = env.authToken;

    if (!baseUrl || !authToken) {
      // Should never happen after validation, but satisfy TypeScript
      return {
        output: renderError('missing-env', 'without-cache'),
        exitCode: 0,
        cacheUpdate: null,
        invalidateProvider: false,
        path: 'D',
      };
    }

    logger.debug('Path C: Fetching from provider', { providerId, fetchTimeoutMs });
    const fetchStart = Date.now();
    const data = await provider.fetch(baseUrl, authToken, config, fetchTimeoutMs);
    const fetchTime = Date.now() - fetchStart;
    logger.debug('Fetch completed', { fetchTime: `${fetchTime}ms` });

    // Render statusline
    const statusline = renderStatusline(data, config);

    // Compute TTL using getEffectivePollInterval (fixes bug)
    const ttlSeconds = getEffectivePollInterval(config, env.pollIntervalOverride);

    // Create cache entry
    const newEntry: CacheEntry = {
      version: CACHE_VERSION,
      baseUrl,
      tokenHash: env.tokenHash ?? '',
      provider: providerId,
      fetchedAt: data.fetchedAt,
      ttlSeconds,
      data,
      renderedLine: statusline,
      configHash,
      endpointConfigHash,
      errorState: null,
    };

    return {
      output: statusline,
      exitCode: 0,
      cacheUpdate: newEntry,
      invalidateProvider: false,
      path: 'C',
    };
  } catch (error: unknown) {
    // Path D: Fetch error - use stale cache with error indicator or error message
    logger.error('Path D: Fetch error', { error: String(error), hasCachedEntry: !!cachedEntry });

    const errorCategory = classifyFetchError(error);

    // Determine error type from error object
    let errorState: ErrorState = 'network-error';
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 429) {
        errorState = 'rate-limited';
      } else if (errorCategory === 'site-closed') {
        errorState = 'network-error';
      } else if (statusCode && statusCode >= 500) {
        errorState = 'server-error';
      } else if (statusCode === 401 || statusCode === 403) {
        errorState = 'auth-error';
      }
    } else if (errorCategory === 'provider-mismatch') {
      errorState = 'parse-error';
    }

    // Path D2: Fetch error - show error, discard stale cache
    if (cachedEntry) {
      logger.debug('Discarding stale cache, showing error', { errorState, errorCategory });
    } else {
      logger.warn('No cache available for error fallback');
    }
    const errorOutput = renderError(errorState, 'without-cache', providerId);
    return {
      output: errorOutput,
      exitCode: 0,
      cacheUpdate: null,
      invalidateProvider: errorCategory === 'provider-mismatch',
      path: 'D',
    };
  }
}
