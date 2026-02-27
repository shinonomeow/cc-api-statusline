/**
 * sub2api Provider Adapter
 *
 * Endpoint: GET {baseUrl}/v1/usage
 * Auth: Authorization: Bearer {token}
 * Billing modes: subscription (has subscription object) or balance
 */

import type { NormalizedUsage, PeriodTokens, QuotaWindow, Config } from '../types/index.js';
import { computeSoonestReset } from '../types/index.js';
import { secureFetch, HttpError } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';

/**
 * sub2api API response shape (partial - only fields we use)
 */
interface Sub2apiResponse {
  planName?: string;
  remaining?: number;
  unit?: string;
  subscription?: {
    daily_usage_usd?: number;
    daily_limit_usd?: number | null;
    weekly_usage_usd?: number;
    weekly_limit_usd?: number | null;
    monthly_usage_usd?: number;
    monthly_limit_usd?: number | null;
  };
  usage?: {
    today?: Sub2apiPeriodTokens;
    total?: Sub2apiPeriodTokens;
    rpm?: number;
    tpm?: number;
  };
}

interface Sub2apiPeriodTokens {
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

/**
 * Compute next midnight in local timezone
 */
function computeNextMidnightLocal(): string {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  return tomorrow.toISOString();
}

/**
 * Compute next Monday 00:00 in local timezone
 */
function computeNextMondayLocal(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Days until next Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);

  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    0, 0, 0, 0
  );
  return nextMonday.toISOString();
}

/**
 * Compute first of next month 00:00 in local timezone
 */
function computeFirstOfNextMonthLocal(): string {
  const now = new Date();
  const nextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
    0, 0, 0, 0
  );
  return nextMonth.toISOString();
}

/**
 * Map sub2api PeriodTokens to our PeriodTokens (snake_case → camelCase)
 */
function mapPeriodTokens(data: Sub2apiPeriodTokens | undefined): PeriodTokens | null {
  if (!data) return null;

  return {
    requests: data.requests ?? 0,
    inputTokens: data.input_tokens ?? 0,
    outputTokens: data.output_tokens ?? 0,
    cacheCreationTokens: data.cache_creation_tokens ?? 0,
    cacheReadTokens: data.cache_read_tokens ?? 0,
    totalTokens: data.total_tokens ?? 0,
    cost: data.cost ?? 0,
  };
}

/**
 * Create QuotaWindow from usage/limit values
 */
function createQuotaWindow(
  used: number | undefined,
  limit: number | null | undefined,
  resetsAt: string
): QuotaWindow | null {
  if (used === undefined) return null;

  // null limit means unlimited
  const actualLimit = limit === null || limit === undefined ? null : limit;

  // Compute remaining
  let remaining: number | null = null;
  if (actualLimit !== null) {
    remaining = Math.max(0, actualLimit - used);
  }

  return {
    used,
    limit: actualLimit,
    remaining,
    resetsAt,
  };
}

/**
 * Fetch and normalize sub2api usage data
 */
export async function fetchSub2api(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  const url = `${baseUrl}/v1/usage`;

  // Resolve User-Agent
  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

  try {
    const responseText = await secureFetch(
      url,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      },
      timeoutMs,
      resolvedUA
    );

    const data = JSON.parse(responseText) as Sub2apiResponse;

    // Detect billing mode
    const hasSubscription = !!data.subscription;
    const billingMode = hasSubscription ? 'subscription' : 'balance';

    // Initialize base structure
    const result: NormalizedUsage = {
      provider: 'sub2api',
      billingMode,
      planName: data.planName ?? 'Unknown',
      fetchedAt: new Date().toISOString(),
      resetSemantics: 'end-of-day',
      daily: null,
      weekly: null,
      monthly: null,
      balance: null,
      resetsAt: null,
      tokenStats: null,
      rateLimit: null,
    };

    if (billingMode === 'balance') {
      // Balance mode
      const remaining = data.remaining ?? 0;

      // Edge case: remaining == -1 means unlimited
      if (remaining === -1) {
        result.balance = {
          remaining: -1,
          initial: null,
          unit: data.unit ?? 'USD',
        };
      } else {
        result.balance = {
          remaining,
          initial: null,
          unit: data.unit ?? 'USD',
        };
      }
    } else {
      // Subscription mode
      const sub = data.subscription;
      if (!sub) {
        throw new Error('Subscription mode but no subscription object in response');
      }

      // Daily quota
      result.daily = createQuotaWindow(
        sub.daily_usage_usd,
        sub.daily_limit_usd,
        computeNextMidnightLocal()
      );

      // Weekly quota
      result.weekly = createQuotaWindow(
        sub.weekly_usage_usd,
        sub.weekly_limit_usd,
        computeNextMondayLocal()
      );

      // Monthly quota
      result.monthly = createQuotaWindow(
        sub.monthly_usage_usd,
        sub.monthly_limit_usd,
        computeFirstOfNextMonthLocal()
      );

      // Compute soonest reset
      result.resetsAt = computeSoonestReset(result);
    }

    // Token stats (both modes)
    if (data.usage) {
      result.tokenStats = {
        today: mapPeriodTokens(data.usage.today),
        total: mapPeriodTokens(data.usage.total),
        rpm: data.usage.rpm ?? null,
        tpm: data.usage.tpm ?? null,
      };
    }

    return result;
  } catch (error: unknown) {
    // Handle HTTP 429 - quota exhausted
    if (error instanceof HttpError && error.statusCode === 429) {
      // Return minimal structure with all remaining set to 0
      return {
        provider: 'sub2api',
        billingMode: 'subscription',
        planName: 'Quota Exhausted',
        fetchedAt: new Date().toISOString(),
        resetSemantics: 'end-of-day',
        daily: {
          used: 0,
          limit: 0,
          remaining: 0,
          resetsAt: computeNextMidnightLocal(),
        },
        weekly: null,
        monthly: null,
        balance: null,
        resetsAt: computeNextMidnightLocal(),
        tokenStats: null,
        rateLimit: null,
      };
    }

    // Re-throw other errors (401/403 will be handled by polling engine)
    throw error;
  }
}
