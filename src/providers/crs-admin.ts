/**
 * CRS Admin Provider Adapter
 *
 * Endpoint: GET {baseUrl}/api/v1/admin/accounts/{accountId}/usage
 * Auth: x-api-key: {token}
 * Config: CC_STATUSLINE_ACCOUNT_ID for account ID
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import { createEmptyNormalizedUsage } from '../types/index.js';
import { secureFetch } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';
import { readCurrentEnv } from '../services/env.js';
import { createQuotaWindow } from './quota-window.js';
import { DEFAULT_TIMEOUT_BUDGET_MS } from '../core/constants.js';

interface CrsAdminWindowStats {
  requests?: number;
  tokens?: number;
  cost?: number;
  standard_cost?: number;
  user_cost?: number;
}

interface CrsAdminWindow {
  utilization?: number;
  resets_at?: string | null;
  remaining_seconds?: number;
  window_stats?: CrsAdminWindowStats;
}

interface CrsAdminResponse {
  code?: number;
  message?: string;
  data?: {
    updated_at?: string;
    five_hour?: CrsAdminWindow;
    seven_day?: CrsAdminWindow;
    seven_day_sonnet?: CrsAdminWindow;
  };
}

/**
 * Fetch and normalize CRS Admin usage data
 */
export async function fetchCrsAdmin(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = DEFAULT_TIMEOUT_BUDGET_MS
): Promise<NormalizedUsage> {
  const env = readCurrentEnv();
  const accountId = env.accountId;
  const apiKey = env.crsApiKey;

  if (!accountId) {
    throw new Error(
      'Missing required environment variable: CC_STATUSLINE_ACCOUNT_ID (needed for crs-admin provider)'
    );
  }

  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: CC_STATUSLINE_CRS_API_KEY (needed for crs-admin provider)'
    );
  }

  const url = `${baseUrl}/api/v1/admin/accounts/${accountId}/usage`;

  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

  const responseText = await secureFetch(
    url,
    {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    },
    timeoutMs,
    resolvedUA
  );

  const raw = JSON.parse(responseText) as CrsAdminResponse;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response: expected object');
  }

  if (!raw.data || typeof raw.data !== 'object') {
    throw new Error('Invalid response: missing data field');
  }

  const data = raw.data;

  const base = createEmptyNormalizedUsage('crs-admin', 'subscription', 'CRS Admin');

  // Map five_hour → daily (utilization 0-100, limit 100)
  const daily = createQuotaWindow(
    data.five_hour?.utilization,
    100,
    data.five_hour?.resets_at ?? null
  );

  // Map seven_day → weekly (utilization 0-100, limit 100)
  const weekly = createQuotaWindow(
    data.seven_day?.utilization,
    100,
    data.seven_day?.resets_at ?? null
  );

  // Map seven_day_sonnet → monthly slot
  const monthly = createQuotaWindow(
    data.seven_day_sonnet?.utilization,
    100,
    data.seven_day_sonnet?.resets_at ?? null
  );

  // Build token stats from five_hour window_stats
  const ws = data.five_hour?.window_stats;
  const tokenStats = ws
    ? {
        today: {
          requests: ws.requests ?? 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: ws.tokens ?? 0,
          cost: ws.user_cost ?? 0,
        },
        total: null,
        rpm: null,
        tpm: null,
      }
    : null;

  return {
    ...base,
    resetSemantics: 'rolling-window',
    daily,
    weekly,
    monthly,
    tokenStats,
  };
}
