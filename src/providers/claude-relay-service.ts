/**
 * claude-relay-service Provider Adapter
 *
 * Endpoint: POST {origin}/apiStats/api/user-stats
 * Auth: Body auth with { "apiKey": token }
 * Billing mode: Always "subscription"-like (cost-limit based)
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import { computeSoonestReset, createEmptyNormalizedUsage } from '../types/index.js';
import { secureFetch, HttpError } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';
import { extractOrigin } from './health-probe.js';
import { createQuotaWindow } from './quota-window.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../core/constants.js';
import {
  computeNextMidnightLocal,
  computeNextMondayLocal,
} from '../services/time.js';

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
 * Fetch and normalize claude-relay-service usage data
 */
export async function fetchClaudeRelayService(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<NormalizedUsage> {
  // Extract origin to properly construct URL
  // /apiStats is mounted at root, not under /api
  const origin = extractOrigin(baseUrl);
  const url = `${origin}/apiStats/api/user-stats`;

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

    // Create base using factory
    const base = createEmptyNormalizedUsage(
      'claude-relay-service',
      'subscription',
      data.name ?? 'API Key'
    );

    // Build daily quota
    const daily = createQuotaWindow(
      limits.currentDailyCost,
      limits.dailyCostLimit,
      computeNextMidnightLocal()
    );

    // Build weekly quota (Opus-only cost)
    const weeklyResetsAt =
      limits.weeklyResetDay !== undefined && limits.weeklyResetHour !== undefined
        ? computeWeeklyResetTime(limits.weeklyResetDay, limits.weeklyResetHour)
        : computeNextMondayLocal();

    const weekly = createQuotaWindow(
      limits.weeklyOpusCost,
      limits.weeklyOpusCostLimit,
      weeklyResetsAt
    );

    // resetsAt: use windowEndTime if available, otherwise compute from quota windows
    const resetsAt = limits.windowEndTime
      ? new Date(limits.windowEndTime).toISOString()
      : (() => {
          const tempResult = { ...base, daily, weekly, monthly: null };
          return computeSoonestReset(tempResult);
        })();

    // Build token stats (total only, no today)
    const tokenStats = data.usage?.total
      ? {
          today: null,
          total: {
            requests: data.usage.total.requests ?? 0,
            inputTokens: data.usage.total.inputTokens ?? 0,
            outputTokens: data.usage.total.outputTokens ?? 0,
            cacheCreationTokens: data.usage.total.cacheCreateTokens ?? 0,
            cacheReadTokens: data.usage.total.cacheReadTokens ?? 0,
            totalTokens:
              data.usage.total.tokens ??
              (data.usage.total.inputTokens ?? 0) + (data.usage.total.outputTokens ?? 0),
            cost: data.usage.total.cost ?? 0,
          },
          rpm: null,
          tpm: null,
        }
      : null;

    // Build rate limit window
    const rateLimit =
      limits.rateLimitWindow !== undefined
        ? {
            windowSeconds: limits.rateLimitWindow * 60, // Convert minutes to seconds
            requestsUsed: limits.currentWindowRequests ?? 0,
            requestsLimit:
              limits.rateLimitRequests && limits.rateLimitRequests > 0
                ? limits.rateLimitRequests
                : null,
            costUsed: limits.currentWindowCost ?? 0,
            costLimit: limits.rateLimitCost && limits.rateLimitCost > 0 ? limits.rateLimitCost : null,
            remainingSeconds: limits.windowRemainingSeconds ?? 0,
          }
        : null;

    // Return immutable result
    return {
      ...base,
      resetSemantics: 'rolling-window',
      daily,
      weekly,
      monthly: null,
      resetsAt,
      tokenStats,
      rateLimit,
    };
}
