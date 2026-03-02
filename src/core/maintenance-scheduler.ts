/**
 * Maintenance Task Scheduler
 *
 * Selects one maintenance task per Path A/B cycle.
 * Heavy tasks (health probe, cache GC) are isolated to cycles that
 * complete in <50ms (Path A/B), leaving ample budget before watchdog fires.
 *
 * Pure functions — no side effects.
 */

import type { ExecutionPath } from './types.js';
import { DETECTION_TTL_BASE_S, DETECTION_TTL_MAX_S, DETECTION_TTL_CHANGED_S, DETECTION_TTL_FAILED_S, MAINTENANCE_GC_PROBABILITY } from './constants.js';

export type MaintenanceTask = 'health-probe' | 'cache-gc' | 'none';

export interface MaintenanceContext {
  /** Execution path taken this cycle */
  path: ExecutionPath;
  /** Age of detection cache in ms, or null if no cache on disk */
  detectionCacheAgeMs: number | null;
  /** Current TTL of detection cache in ms */
  detectionCacheTtlMs: number;
}

export interface ProbeOutcome {
  /** Whether the probe request succeeded */
  success: boolean;
  /** Provider ID matched by health response, or null */
  matchedProvider: string | null;
  /** Round-trip time in ms */
  responseTimeMs: number;
}

/**
 * Select a single maintenance task for the current cycle
 *
 * Rules:
 * 1. Only run on Path A or B (fast cycles with remaining budget)
 * 2. Priority 1: probe if detection cache is absent or past 50% TTL
 * 3. Priority 2: cache GC at 10% probability
 * 4. Otherwise: none
 *
 * @param ctx - Maintenance context with path and cache state
 * @returns The maintenance task to run, or 'none'
 */
export function selectMaintenanceTask(ctx: MaintenanceContext): MaintenanceTask {
  if (ctx.path !== 'A' && ctx.path !== 'B') return 'none';

  // Priority 1: proactive health probe when detection cache absent or past 50% TTL
  if (ctx.detectionCacheAgeMs === null) return 'health-probe';
  if (ctx.detectionCacheAgeMs >= ctx.detectionCacheTtlMs * 0.5) return 'health-probe';

  // Priority 2: probabilistic cache GC (~10% of Path A/B cycles)
  if (Math.random() < MAINTENANCE_GC_PROBABILITY) return 'cache-gc';

  return 'none';
}

/**
 * Compute dynamic detection TTL from a probe outcome
 *
 * Progressive strategy:
 * - Healthy + stable provider → double current TTL (capped at 7 days)
 * - Healthy + provider changed → reset to 1 hour (confirm change quickly)
 * - Probe failed → shrink to 5 minutes (aggressive retry)
 *
 * @param outcome - Result of the health probe
 * @param currentProvider - Provider ID currently stored in detection cache
 * @param currentTtlSeconds - TTL currently stored in detection cache
 * @returns New TTL in seconds
 */
export function computeDynamicDetectionTtl(
  outcome: ProbeOutcome,
  currentProvider: string,
  currentTtlSeconds: number
): number {
  if (!outcome.success) return DETECTION_TTL_FAILED_S;
  if (outcome.matchedProvider !== currentProvider) return DETECTION_TTL_CHANGED_S;
  // Provider stable → extend: double current TTL, capped at maximum
  return Math.min(currentTtlSeconds * 2, DETECTION_TTL_MAX_S);
}

