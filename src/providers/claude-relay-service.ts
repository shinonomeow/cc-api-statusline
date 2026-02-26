/**
 * claude-relay-service Provider Adapter
 *
 * Endpoint: POST {baseUrl}/apiStats/api/user-stats
 * Auth: Body auth with { "apiKey": token }
 * Billing mode: Always "subscription"-like (cost-limit based)
 */

import type { NormalizedUsage, QuotaWindow, Config } from '../types/index.js';
import { secureFetch, HttpError } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';

/**
 * claude-relay-service API response shape
 */
interface RelayResponse {
  success: boolean;
  data: {
    name?: string;
    limits: {
      currentDailyCost?: number;
      dailyCostLimit?: number;
      weeklyOpusCost?: number;
      weeklyOpusCostLimit?: number;
      weeklyResetDay?: number;
      weeklyResetHour?: number;
      rateLimitWindow?: number; // minutes
      currentWindowRequests?: number;
      rateLimitRequests?: number;
      currentWindowCost?: number;
      rateLimitCost?: number;
      windowRemainingSeconds?: number;
      windowEndTime?: number | null; // Unix ms
      windowStartTime?: number | null; // Unix ms
    };
    usage?: {
      total?: {
        requests?: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheCreateTokens?: number;
        cacheReadTokens?: number;
        tokens?: number;
        cost?: number;
      };
    };
  };
}

/**
 * Compute weekly reset time from resetDay (0-6) and resetHour (0-23)
 */
function computeWeeklyResetTime(resetDay: number, resetHour: number): string {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  // Calculate days until reset
  let daysUntilReset = resetDay - currentDay;
  if (daysUntilReset < 0 || (daysUntilReset === 0 && currentHour >= resetHour)) {
    daysUntilReset += 7;
  }

  const resetDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilReset,
    resetHour,
    0,
    0,
    0
  ));

  return resetDate.toISOString();
}

/**
 * Create QuotaWindow from usage/limit values
 * 0 limit means unlimited → null
 */
function createQuotaWindow(
  used: number | undefined,
  limit: number | undefined,
  resetsAt: string | null
): QuotaWindow | null {
  if (used === undefined) return null;

  // 0 or undefined limit means unlimited → null
  const actualLimit = limit && limit > 0 ? limit : null;

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
 * Fetch and normalize claude-relay-service usage data
 */
export async function fetchClaudeRelayService(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  const url = `${baseUrl}/apiStats/api/user-stats`;

  // Resolve User-Agent
  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

  const responseText = await secureFetch(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ apiKey: token }),
    },
    timeoutMs,
    resolvedUA
  );

  const response = JSON.parse(responseText) as RelayResponse;

    // Check success wrapper
    if (!response.success) {
      throw new HttpError('Relay API returned success: false');
    }

    const data = response.data;
    const limits = data.limits;

    // Initialize base structure
    const result: NormalizedUsage = {
      provider: 'claude-relay-service',
      billingMode: 'subscription',
      planName: data.name ?? 'API Key',
      fetchedAt: new Date().toISOString(),
      resetSemantics: 'rolling-window',
      daily: null,
      weekly: null,
      monthly: null,
      balance: null,
      resetsAt: null,
      tokenStats: null,
      rateLimit: null,
    };

    // Daily quota
    result.daily = createQuotaWindow(
      limits.currentDailyCost,
      limits.dailyCostLimit,
      null // Resets at midnight server TZ (not provided by API)
    );

    // Weekly quota (Opus-only cost)
    // Note: This tracks Opus-model cost only, not total cost
    if (limits.weeklyResetDay !== undefined && limits.weeklyResetHour !== undefined) {
      const weeklyResetsAt = computeWeeklyResetTime(
        limits.weeklyResetDay,
        limits.weeklyResetHour
      );
      result.weekly = createQuotaWindow(
        limits.weeklyOpusCost,
        limits.weeklyOpusCostLimit,
        weeklyResetsAt
      );
    } else {
      result.weekly = createQuotaWindow(
        limits.weeklyOpusCost,
        limits.weeklyOpusCostLimit,
        null
      );
    }

    // Monthly: not provided by relay
    result.monthly = null;

    // resetsAt: use windowEndTime if available
    if (limits.windowEndTime) {
      result.resetsAt = new Date(limits.windowEndTime).toISOString();
    }

    // Token stats (total only, no today)
    if (data.usage?.total) {
      const total = data.usage.total;
      result.tokenStats = {
        today: null,
        total: {
          requests: total.requests ?? 0,
          inputTokens: total.inputTokens ?? 0,
          outputTokens: total.outputTokens ?? 0,
          cacheCreationTokens: total.cacheCreateTokens ?? 0,
          cacheReadTokens: total.cacheReadTokens ?? 0,
          totalTokens: total.tokens ?? (total.inputTokens ?? 0) + (total.outputTokens ?? 0),
          cost: total.cost ?? 0,
        },
        rpm: null,
        tpm: null,
      };
    }

    // Rate limit window
    if (limits.rateLimitWindow !== undefined) {
      result.rateLimit = {
        windowSeconds: limits.rateLimitWindow * 60, // Convert minutes to seconds
        requestsUsed: limits.currentWindowRequests ?? 0,
        requestsLimit: limits.rateLimitRequests && limits.rateLimitRequests > 0
          ? limits.rateLimitRequests
          : null,
        costUsed: limits.currentWindowCost ?? 0,
        costLimit: limits.rateLimitCost && limits.rateLimitCost > 0
          ? limits.rateLimitCost
          : null,
        remainingSeconds: limits.windowRemainingSeconds ?? 0,
      };
    }

  return result;
}
