/**
 * Custom Provider Support
 *
 * Config-driven provider adapter with JSONPath response mapping
 */

import type { NormalizedUsage, BillingMode, Config } from '../types/index.js';
import type { CustomProviderConfig } from '../types/index.js';
import { createEmptyNormalizedUsage } from '../types/index.js';
import { secureFetch } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';

/**
 * Simple JSONPath resolver
 *
 * Supports:
 * - Dot notation: $.data.field
 * - Array index: $.data.items[0]
 * - Nested: $.data.items[0].field
 *
 * Does NOT support:
 * - Wildcards: $.data[*]
 * - Filters: $[?(@.active)]
 * - Recursive descent: $..field
 */
function resolveJsonPath(data: unknown, path: string): unknown {
  if (!path.startsWith('$.')) {
    // Treat as literal value
    return path;
  }

  // Remove leading $.
  const parts = path.slice(2).split(/\.|\[|\]/).filter(p => p.length > 0);

  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }

    if (typeof current !== 'object') {
      return null;
    }

    // Try as array index
    const index = parseInt(part, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      // Try as object key
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Extract value from mapping, resolving JSONPath if needed
 */
function extractValue(
  data: unknown,
  mapping: string | undefined,
  defaultValue: unknown = null
): unknown {
  if (!mapping) return defaultValue;

  const resolved = resolveJsonPath(data, mapping);
  return resolved ?? defaultValue;
}

/**
 * Extract number value
 */
function extractNumber(
  data: unknown,
  mapping: string | undefined
): number | null {
  const value = extractValue(data, mapping);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Extract string value
 */
function extractString(
  data: unknown,
  mapping: string | undefined,
  defaultValue: string = ''
): string {
  const value = extractValue(data, mapping, defaultValue);
  if (typeof value === 'string') return value;
  return String(value);
}

/**
 * Validate custom provider providerConfig per spec-custom-providers.md
 */
export function validateCustomProvider(providerConfig: CustomProviderConfig): string | null {
  if (!providerConfig.id) return 'Custom provider missing required field: id';
  if (!providerConfig.endpoint) return 'Custom provider missing required field: endpoint';
  if (!providerConfig.method) return 'Custom provider missing required field: method';
  if (!providerConfig.auth) return 'Custom provider missing required field: auth';
  if (!providerConfig.responseMapping) return 'Custom provider missing required field: responseMapping';

  // Endpoint must start with /
  if (!providerConfig.endpoint.startsWith('/')) {
    return 'Custom provider endpoint must start with /';
  }

  // billingMode is required in responseMapping
  if (!providerConfig.responseMapping.billingMode) {
    return 'Custom provider responseMapping must include billingMode';
  }

  // Validate auth providerConfig
  if (providerConfig.auth.type === 'header' && !providerConfig.auth.header) {
    return 'Custom provider auth.type="header" requires auth.header';
  }
  if (providerConfig.auth.type === 'body' && !providerConfig.auth.bodyField) {
    return 'Custom provider auth.type="body" requires auth.bodyField';
  }

  // urlPatterns is optional per spec, but should be array if provided
  if (providerConfig.urlPatterns && !Array.isArray(providerConfig.urlPatterns)) {
    return 'Custom provider urlPatterns must be an array';
  }

  return null;
}

/**
 * Fetch and normalize custom provider usage data
 */
export async function fetchCustom(
  baseUrl: string,
  token: string,
  appConfig: Config,
  providerConfig: CustomProviderConfig,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  // Validate providerConfig
  const validationError = validateCustomProvider(providerConfig);
  if (validationError) {
    throw new Error(`Invalid custom provider providerConfig: ${validationError}`);
  }

  const url = `${baseUrl}${providerConfig.endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (providerConfig.contentType) {
    headers['Content-Type'] = providerConfig.contentType;
  }

  // Add auth header if type is header
  if (providerConfig.auth.type === 'header' && providerConfig.auth.header) {
    const prefix = providerConfig.auth.prefix ?? '';
    headers[providerConfig.auth.header] = `${prefix}${token}`;
  }

  // Build request body
  let body: string | undefined;
  if (providerConfig.method === 'POST') {
    if (providerConfig.auth.type === 'body' && providerConfig.auth.bodyField) {
      // Merge auth into requestBody
      const bodyObj = { ...providerConfig.requestBody };
      bodyObj[providerConfig.auth.bodyField] = token;
      body = JSON.stringify(bodyObj);
    } else if (providerConfig.requestBody) {
      body = JSON.stringify(providerConfig.requestBody);
    }
  }

  // Resolve User-Agent with per-provider override
  const providerUA = providerConfig.spoofClaudeCodeUA;
  const globalUA = appConfig.spoofClaudeCodeUA;
  const effectiveUA = providerUA !== undefined ? providerUA : globalUA;
  const resolvedUA = resolveUserAgent(effectiveUA);

  if (resolvedUA) {
    logger.debug(`Using User-Agent for ${providerConfig.id}: ${resolvedUA}`);
  }

  const responseText = await secureFetch(
    url,
    {
      method: providerConfig.method,
      headers,
      body,
    },
    timeoutMs,
    resolvedUA
  );

  const responseData = JSON.parse(responseText) as Record<string, unknown>;

    // Extract values using responseMapping
    const mapping = providerConfig.responseMapping;

    // Determine billing mode
    const billingModeStr = extractString(responseData, mapping.billingMode, 'subscription');
    const billingMode: BillingMode =
      billingModeStr === 'balance' ? 'balance' : 'subscription';

    // Extract plan name
    const planName = extractString(
      responseData,
      mapping.planName,
      providerConfig.displayName ?? providerConfig.id
    );

    // Create base result
    const result = createEmptyNormalizedUsage(providerConfig.id, billingMode, planName);

    // Set resetSemantics based on billing mode (can be overridden by mapping)
    result.resetSemantics = billingMode === 'balance' ? 'expiry' : 'end-of-day';

    // Extract balance (if balance mode)
    if (mapping['balance.remaining']) {
      const remaining = extractNumber(responseData, mapping['balance.remaining']);
      if (remaining !== null) {
        result.balance = {
          remaining,
          initial: extractNumber(responseData, mapping['balance.initial']),
          unit: extractString(responseData, mapping['balance.unit'], 'USD'),
        };
      }
    }

    // Extract daily quota (apply 0 → null rule for limits)
    const dailyUsed = extractNumber(responseData, mapping['daily.used']);
    const dailyLimitRaw = extractNumber(responseData, mapping['daily.limit']);
    const dailyLimit = dailyLimitRaw === 0 ? null : dailyLimitRaw;
    if (dailyUsed !== null) {
      result.daily = {
        used: dailyUsed,
        limit: dailyLimit,
        remaining: dailyLimit !== null ? Math.max(0, dailyLimit - dailyUsed) : null,
        resetsAt: extractString(responseData, mapping['daily.resetsAt'], '') || null,
      };
    }

    // Extract weekly quota (apply 0 → null rule for limits)
    const weeklyUsed = extractNumber(responseData, mapping['weekly.used']);
    const weeklyLimitRaw = extractNumber(responseData, mapping['weekly.limit']);
    const weeklyLimit = weeklyLimitRaw === 0 ? null : weeklyLimitRaw;
    if (weeklyUsed !== null) {
      result.weekly = {
        used: weeklyUsed,
        limit: weeklyLimit,
        remaining: weeklyLimit !== null ? Math.max(0, weeklyLimit - weeklyUsed) : null,
        resetsAt: extractString(responseData, mapping['weekly.resetsAt'], '') || null,
      };
    }

    // Extract monthly quota (apply 0 → null rule for limits)
    const monthlyUsed = extractNumber(responseData, mapping['monthly.used']);
    const monthlyLimitRaw = extractNumber(responseData, mapping['monthly.limit']);
    const monthlyLimit = monthlyLimitRaw === 0 ? null : monthlyLimitRaw;
    if (monthlyUsed !== null) {
      result.monthly = {
        used: monthlyUsed,
        limit: monthlyLimit,
        remaining: monthlyLimit !== null ? Math.max(0, monthlyLimit - monthlyUsed) : null,
        resetsAt: extractString(responseData, mapping['monthly.resetsAt'], '') || null,
      };
    }

    // Extract token stats - today
    if (mapping['tokenStats.today.requests']) {
      const todayRequests = extractNumber(responseData, mapping['tokenStats.today.requests']);
      if (todayRequests !== null) {
        result.tokenStats = result.tokenStats ?? { today: null, total: null, rpm: null, tpm: null };
        result.tokenStats.today = {
          requests: todayRequests,
          inputTokens: extractNumber(responseData, mapping['tokenStats.today.inputTokens']) ?? 0,
          outputTokens: extractNumber(responseData, mapping['tokenStats.today.outputTokens']) ?? 0,
          cacheCreationTokens: extractNumber(responseData, mapping['tokenStats.today.cacheCreationTokens']) ?? 0,
          cacheReadTokens: extractNumber(responseData, mapping['tokenStats.today.cacheReadTokens']) ?? 0,
          totalTokens: extractNumber(responseData, mapping['tokenStats.today.totalTokens']) ?? 0,
          cost: extractNumber(responseData, mapping['tokenStats.today.cost']) ?? 0,
        };
      }
    }

    // Extract token stats - total
    if (mapping['tokenStats.total.requests']) {
      const totalRequests = extractNumber(responseData, mapping['tokenStats.total.requests']);
      if (totalRequests !== null) {
        result.tokenStats = result.tokenStats ?? { today: null, total: null, rpm: null, tpm: null };
        result.tokenStats.total = {
          requests: totalRequests,
          inputTokens: extractNumber(responseData, mapping['tokenStats.total.inputTokens']) ?? 0,
          outputTokens: extractNumber(responseData, mapping['tokenStats.total.outputTokens']) ?? 0,
          cacheCreationTokens: extractNumber(responseData, mapping['tokenStats.total.cacheCreationTokens']) ?? 0,
          cacheReadTokens: extractNumber(responseData, mapping['tokenStats.total.cacheReadTokens']) ?? 0,
          totalTokens: extractNumber(responseData, mapping['tokenStats.total.totalTokens']) ?? 0,
          cost: extractNumber(responseData, mapping['tokenStats.total.cost']) ?? 0,
        };
      }
    }

    // Extract rate/tpm
    if (mapping['tokenStats.rpm']) {
      result.tokenStats = result.tokenStats ?? { today: null, total: null, rpm: null, tpm: null };
      result.tokenStats.rpm = extractNumber(responseData, mapping['tokenStats.rpm']);
    }
    if (mapping['tokenStats.tpm']) {
      result.tokenStats = result.tokenStats ?? { today: null, total: null, rpm: null, tpm: null };
      result.tokenStats.tpm = extractNumber(responseData, mapping['tokenStats.tpm']);
    }

    // Extract rate limit
    if (mapping['rateLimit.windowSeconds']) {
      const windowSeconds = extractNumber(responseData, mapping['rateLimit.windowSeconds']);
      if (windowSeconds !== null) {
        result.rateLimit = {
          windowSeconds,
          requestsUsed: extractNumber(responseData, mapping['rateLimit.requestsUsed']) ?? 0,
          requestsLimit: extractNumber(responseData, mapping['rateLimit.requestsLimit']),
          costUsed: extractNumber(responseData, mapping['rateLimit.costUsed']) ?? 0,
          costLimit: extractNumber(responseData, mapping['rateLimit.costLimit']),
          remainingSeconds: extractNumber(responseData, mapping['rateLimit.remainingSeconds']) ?? 0,
        };
      }
    }

    // Compute soonest reset if we have any quota windows
    if (result.daily?.resetsAt || result.weekly?.resetsAt || result.monthly?.resetsAt) {
      const times: string[] = [];
      if (result.daily?.resetsAt) times.push(result.daily.resetsAt);
      if (result.weekly?.resetsAt) times.push(result.weekly.resetsAt);
      if (result.monthly?.resetsAt) times.push(result.monthly.resetsAt);
      times.sort();
      result.resetsAt = times[0] ?? null;
    }

  return result;
}
