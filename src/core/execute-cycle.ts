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
import { renderError } from '../renderer/error.js';
import type { CacheEntry } from '../types/index.js';
import { CACHE_VERSION } from '../types/index.js';
import { logger } from '../services/logger.js';
import { EXIT_BUFFER_MS } from './constants.js';

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
  const { env, config, configHash, cachedEntry, providerId, provider, timeoutBudgetMs, startTime, fetchTimeoutMs } = ctx;

  // Path A: Fast path - cached renderedLine usable
  // Requires: cache valid + configHash match + provider match
  if (cachedEntry) {
    if (isCacheValid(cachedEntry, env) && isCacheProviderValid(cachedEntry, providerId)) {
      if (cachedEntry.renderedLine && isCacheRenderedLineUsable(cachedEntry, configHash)) {
        // Fast path: return cached rendered line
        logger.debug('Path A: Fast path (cached renderedLine)', {
          cacheAge: `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s`
        });
        return {
          output: cachedEntry.renderedLine,
          exitCode: 0,
          cacheUpdate: null,
        };
      }
    }
  }

  // Path B: Cache data valid but renderedLine stale → re-render
  if (cachedEntry && isCacheValid(cachedEntry, env) && isCacheProviderValid(cachedEntry, providerId)) {
    // Re-render from cached data
    logger.debug('Path B: Re-render (config changed, cache data valid)');
    const statusline = renderStatusline(cachedEntry.data, config);

    // Update cache with new renderedLine and configHash
    const updatedEntry: CacheEntry = {
      ...cachedEntry,
      renderedLine: statusline,
      configHash,
    };

    return {
      output: statusline,
      exitCode: 0,
      cacheUpdate: updatedEntry,
    };
  }

  // Path C: Cache stale/missing → fetch within deadline
  // Calculate deadline and remaining budget
  const deadline = startTime + timeoutBudgetMs - EXIT_BUFFER_MS;
  const remainingBudget = deadline - Date.now();

  // Guard: insufficient time budget
  if (remainingBudget <= 50) {
    // Path D: Fallback - use stale cache or loading message
    logger.debug('Path D: Timeout fallback (insufficient budget)', { remainingBudget });
    if (cachedEntry && cachedEntry.renderedLine) {
      return {
        output: cachedEntry.renderedLine,
        exitCode: 0,
        cacheUpdate: null,
      };
    } else {
      return {
        output: '[loading...]',
        exitCode: 0,
        cacheUpdate: null,
      };
    }
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
      errorState: null,
    };

    return {
      output: statusline,
      exitCode: 0,
      cacheUpdate: newEntry,
    };
  } catch (error: unknown) {
    // Path D: Fetch error - use stale cache with error indicator or error message
    logger.error('Path D: Fetch error', { error: String(error), hasCachedEntry: !!cachedEntry });
    if (cachedEntry) {
      const ageMinutes = Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 60000);
      const statusline = renderStatusline(cachedEntry.data, config, 'network-error', ageMinutes);
      logger.debug('Using stale cache with error indicator', { ageMinutes });
      return {
        output: statusline,
        exitCode: 0, // Changed from 1 - stale cache output is still useful
        cacheUpdate: null,
      };
    } else {
      // No cache available
      logger.warn('No cache available for error fallback');
      const errorOutput = renderError('network-error', 'without-cache', providerId);
      return {
        output: errorOutput,
        exitCode: 0,
        cacheUpdate: null,
      };
    }
  }
}
