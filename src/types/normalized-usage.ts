/**
 * Normalized Usage Schema
 *
 * All provider adapters must map their response into this shape.
 * The renderer and cache layer only ever work with NormalizedUsage.
 */

/**
 * Quota window for a period (daily/weekly/monthly)
 */
export interface QuotaWindow {
  used: number; // USD
  limit: number | null; // USD, null = unlimited
  remaining: number | null; // USD, null = unlimited
  resetsAt: string | null; // ISO-8601 UTC
  qualifier?: string; // Optional label qualifier, e.g. 'Opus' → renders as "Weekly (Opus)"
}

/**
 * Balance information (prepaid credit)
 */
export interface BalanceInfo {
  remaining: number; // USD (note: -1 = unlimited for sub2api)
  initial: number | null; // USD, original purchase amount (for auto color)
  unit: string; // usually "USD"
}

/**
 * Token usage for a period
 */
export interface PeriodTokens {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number; // USD
}

/**
 * Token statistics (today and total)
 */
export interface TokenStats {
  today: PeriodTokens | null;
  total: PeriodTokens | null;
  rpm: number | null; // requests/min
  tpm: number | null; // tokens/min
}

/**
 * Rate limit window information
 */
export interface RateLimitWindow {
  windowSeconds: number;
  requestsUsed: number;
  requestsLimit: number | null;
  costUsed: number;
  costLimit: number | null;
  remainingSeconds: number;
}

/**
 * Reset semantics for quota windows
 */
export type ResetSemantics =
  | 'end-of-day'
  | 'rolling-window'
  | 'end-of-week'
  | 'end-of-month'
  | 'expiry';

/**
 * Billing mode
 */
export type BillingMode = 'subscription' | 'balance';

/**
 * Normalized usage data from any provider
 *
 * Metadata fields (provider, billingMode, planName, fetchedAt, resetSemantics)
 * are always non-null and set by the adapter framework.
 *
 * Data fields (daily, weekly, monthly, balance, tokenStats, rateLimit) are all
 * nullable — the renderer must tolerate nulls everywhere.
 */
export interface NormalizedUsage {
  // --- Metadata (always non-null, set by adapter framework) ---
  provider: string; // e.g. "sub2api", "claude-relay-service"
  billingMode: BillingMode;
  planName: string; // human-readable, display-only
  fetchedAt: string; // ISO-8601 UTC, set at fetch time
  resetSemantics: ResetSemantics;

  // --- Data fields (all nullable — renderer must tolerate nulls) ---
  daily: QuotaWindow | null;
  weekly: QuotaWindow | null;
  monthly: QuotaWindow | null;
  balance: BalanceInfo | null;
  resetsAt: string | null; // ISO-8601 UTC, soonest upcoming reset across all windows
  tokenStats: TokenStats | null;
  rateLimit: RateLimitWindow | null;
}

/**
 * Type guard for QuotaWindow
 */
export function isQuotaWindow(value: unknown): value is QuotaWindow {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q['used'] === 'number' &&
    (q['limit'] === null || typeof q['limit'] === 'number') &&
    (q['remaining'] === null || typeof q['remaining'] === 'number') &&
    (q['resetsAt'] === null || typeof q['resetsAt'] === 'string')
  );
}

/**
 * Type guard for BalanceInfo
 */
export function isBalanceInfo(value: unknown): value is BalanceInfo {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b['remaining'] === 'number' &&
    (b['initial'] === null || typeof b['initial'] === 'number') &&
    typeof b['unit'] === 'string'
  );
}

/**
 * Factory: Create empty NormalizedUsage with only metadata fields
 */
export function createEmptyNormalizedUsage(
  provider: string,
  billingMode: BillingMode,
  planName: string
): NormalizedUsage {
  return {
    // Metadata
    provider,
    billingMode,
    planName,
    fetchedAt: new Date().toISOString(),
    resetSemantics: 'end-of-day',

    // Data fields (all null)
    daily: null,
    weekly: null,
    monthly: null,
    balance: null,
    resetsAt: null,
    tokenStats: null,
    rateLimit: null,
  };
}

/**
 * Compute the soonest reset time from all quota windows (immutable)
 */
export function computeSoonestReset(usage: NormalizedUsage): string | null {
  const times: string[] = [];

  if (usage.daily?.resetsAt) times.push(usage.daily.resetsAt);
  if (usage.weekly?.resetsAt) times.push(usage.weekly.resetsAt);
  if (usage.monthly?.resetsAt) times.push(usage.monthly.resetsAt);

  if (times.length === 0) return null;

  // Sort ISO-8601 strings lexicographically (they sort correctly)
  // Create new array to avoid mutating input
  const sorted = [...times].sort();
  return sorted[0] ?? null;
}
