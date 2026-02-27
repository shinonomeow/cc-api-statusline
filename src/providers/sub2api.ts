/**
 * sub2api Provider Adapter
 *
 * Endpoint: GET {baseUrl}/v1/usage
 * Auth: Authorization: Bearer {token}
 * Billing modes: subscription (has subscription object) or balance
 */

import type { NormalizedUsage, PeriodTokens, Config } from '../types/index.js';
import { computeSoonestReset, createEmptyNormalizedUsage } from '../types/index.js';
import { secureFetch } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';
import { createQuotaWindow } from './quota-window.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../core/constants.js';

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
 * Fetch and normalize sub2api usage data
 */
export async function fetchSub2api(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<NormalizedUsage> {
  const url = `${baseUrl}/v1/usage`;

  // Resolve User-Agent
  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

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

    // Validate response shape
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response: expected object');
    }
    if (typeof data.planName !== 'string' && data.planName !== undefined) {
      throw new Error('Invalid response: planName must be string or undefined');
    }

    // Detect billing mode
    const hasSubscription = !!data.subscription;
    const billingMode = hasSubscription ? 'subscription' : 'balance';

    // Create base using factory
    const base = createEmptyNormalizedUsage(
      'sub2api',
      billingMode,
      data.planName ?? 'Unknown'
    );

    // Build mode-specific fields
    let balance = null;
    let daily = null;
    let weekly = null;
    let monthly = null;
    let resetsAt = null;

    if (billingMode === 'balance') {
      // Balance mode
      balance = {
        remaining: data.remaining ?? 0,
        initial: null,
        unit: data.unit ?? 'USD',
      };
    } else {
      // Subscription mode
      const sub = data.subscription;
      if (!sub) {
        throw new Error('Subscription mode but no subscription object in response');
      }

      // Note: sub2api doesn't return explicit reset timestamps
      // Setting resetsAt to null will trigger cost display fallback
      daily = createQuotaWindow(
        sub.daily_usage_usd,
        sub.daily_limit_usd,
        null
      );

      weekly = createQuotaWindow(
        sub.weekly_usage_usd,
        sub.weekly_limit_usd,
        null
      );

      monthly = createQuotaWindow(
        sub.monthly_usage_usd,
        sub.monthly_limit_usd,
        null
      );

      // Compute soonest reset from built windows
      const tempResult = { ...base, daily, weekly, monthly };
      resetsAt = computeSoonestReset(tempResult);
    }

    // Build token stats (both modes)
    const tokenStats = data.usage
      ? {
          today: mapPeriodTokens(data.usage.today),
          total: mapPeriodTokens(data.usage.total),
          rpm: data.usage.rpm ?? null,
          tpm: data.usage.tpm ?? null,
        }
      : null;

  // Return immutable result
  return {
    ...base,
    balance,
    daily,
    weekly,
    monthly,
    resetsAt,
    tokenStats,
  };
}
