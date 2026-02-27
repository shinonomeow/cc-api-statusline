/**
 * Shared QuotaWindow factory
 *
 * Creates QuotaWindow from used/limit/resetsAt values.
 * Unified logic for all providers (sub2api, claude-relay-service, custom).
 */

import type { QuotaWindow } from '../types/index.js';

/**
 * Create QuotaWindow from usage/limit values
 *
 * Returns null if:
 * - No usage data (used === undefined)
 * - No limit or 0 limit (unlimited quota, not useful to display)
 *
 * Uses relay's defensive check: !limit || limit <= 0
 * This handles null, undefined, 0, and negative values.
 * Providers that use null/undefined for unlimited quotas are covered.
 * sub2api converts 0-limits upstream, so behavior is preserved.
 *
 * @param used - Current usage in USD
 * @param limit - Quota limit in USD (null/undefined/0 = unlimited)
 * @param resetsAt - ISO-8601 reset time
 * @returns QuotaWindow or null if hidden
 */
export function createQuotaWindow(
  used: number | undefined,
  limit: number | null | undefined,
  resetsAt: string | null
): QuotaWindow | null {
  // No usage data → hide component
  if (used === undefined) {
    return null;
  }

  // No limit or 0 limit (unlimited) → hide component (not useful to display)
  if (!limit || limit <= 0) {
    return null;
  }

  // Compute remaining
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    resetsAt,
  };
}
