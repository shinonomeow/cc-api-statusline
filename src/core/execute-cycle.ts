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
  const deadline = startTime + timeoutBudgetMs - 50; // 50ms exit buffer
  const remainingBudget = deadline - Date.now();

  // Guard: insufficient time budget
  if (remainingBudget <= 50) {
    // Path D: Fallback - use stale cache or loading message
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
        exitCode: 1,
        cacheUpdate: null,
      };
    }

    const data = await provider.fetch(baseUrl, authToken, fetchTimeoutMs);

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
    };

    return {
      output: statusline,
      exitCode: 0,
      cacheUpdate: newEntry,
    };
  } catch {
    // Path D: Fetch error - use stale cache with error indicator or error message
    if (cachedEntry) {
      const ageMinutes = Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 60000);
      const statusline = renderStatusline(cachedEntry.data, config, 'network-error', ageMinutes);
      return {
        output: statusline,
        exitCode: 0, // Changed from 1 - stale cache output is still useful
        cacheUpdate: null,
      };
    } else {
      // No cache available
      const errorOutput = renderError('network-error', 'without-cache', providerId);
      return {
        output: errorOutput,
        exitCode: 1,
        cacheUpdate: null,
      };
    }
  }
}
