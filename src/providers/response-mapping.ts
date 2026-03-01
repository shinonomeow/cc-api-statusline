/**
 * Universal Response Mapping
 *
 * Extracts and transforms API responses to NormalizedUsage format
 * using JSONPath-based field mappings.
 *
 * Works for ALL providers (built-in and custom) via EndpointConfig.
 */

import type { NormalizedUsage, BillingMode, QuotaWindow, PeriodTokens } from '../types/index.js';
import type { EndpointConfig } from '../types/endpoint-config.js';
import { createEmptyNormalizedUsage } from '../types/index.js';
import { computeSoonestReset } from '../types/normalized-usage.js';

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
export function resolveJsonPath(data: unknown, path: string): unknown {
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
export function extractValue(
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
export function extractNumber(
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
export function extractString(
  data: unknown,
  mapping: string | undefined,
  defaultValue: string = ''
): string {
  const value = extractValue(data, mapping, defaultValue);
  if (typeof value === 'string') return value;
  return String(value);
}

/**
 * Extract QuotaWindow for a period (daily/weekly/monthly)
 *
 * Collapses the repeated pattern of extracting used/limit/resetsAt
 * and applying the 0 → null rule for limits.
 */
export function extractQuotaWindow(
  data: unknown,
  mapping: Record<string, string | undefined>,
  prefix: 'daily' | 'weekly' | 'monthly'
): QuotaWindow | null {
  const usedKey = `${prefix}.used`;
  const limitKey = `${prefix}.limit`;
  const resetsAtKey = `${prefix}.resetsAt`;

  const used = extractNumber(data, mapping[usedKey]);
  if (used === null) {
    return null;
  }

  const limitRaw = extractNumber(data, mapping[limitKey]);
  const limit = limitRaw === 0 ? null : limitRaw;

  return {
    used,
    limit,
    remaining: limit !== null ? Math.max(0, limit - used) : null,
    resetsAt: extractString(data, mapping[resetsAtKey], '') || null,
  };
}

/**
 * Extract token stats period (today/total)
 *
 * Collapses the repeated pattern of extracting all token fields.
 */
export function extractTokenStatsPeriod(
  data: unknown,
  mapping: Record<string, string | undefined>,
  prefix: 'tokenStats.today' | 'tokenStats.total'
): PeriodTokens | null {
  const requestsKey = `${prefix}.requests`;
  const requests = extractNumber(data, mapping[requestsKey]);

  if (requests === null) {
    return null;
  }

  return {
    requests,
    inputTokens: extractNumber(data, mapping[`${prefix}.inputTokens`]) ?? 0,
    outputTokens: extractNumber(data, mapping[`${prefix}.outputTokens`]) ?? 0,
    cacheCreationTokens: extractNumber(data, mapping[`${prefix}.cacheCreationTokens`]) ?? 0,
    cacheReadTokens: extractNumber(data, mapping[`${prefix}.cacheReadTokens`]) ?? 0,
    totalTokens: extractNumber(data, mapping[`${prefix}.totalTokens`]) ?? 0,
    cost: extractNumber(data, mapping[`${prefix}.cost`]) ?? 0,
  };
}

/**
 * Map API response to NormalizedUsage
 *
 * Main transformation function that applies all field mappings
 * to build the final NormalizedUsage object immutably.
 *
 * Works for ALL providers via EndpointConfig.
 */
export function mapResponseToUsage(
  responseData: Record<string, unknown>,
  mapping: Record<string, string | undefined>,
  endpointConfig: EndpointConfig
): NormalizedUsage {
  // Determine billing mode
  const billingModeStr = extractString(responseData, mapping.billingMode, 'subscription');
  const billingMode: BillingMode =
    billingModeStr === 'balance' ? 'balance' : 'subscription';

  // Extract plan name
  const planName = extractString(
    responseData,
    mapping.planName,
    endpointConfig.displayName ?? endpointConfig.provider
  );

  // Create base result
  const base = createEmptyNormalizedUsage(endpointConfig.provider, billingMode, planName);

  // Build balance info
  const balance = mapping['balance.remaining']
    ? (() => {
        const remaining = extractNumber(responseData, mapping['balance.remaining']);
        if (remaining === null) return null;
        return {
          remaining,
          initial: extractNumber(responseData, mapping['balance.initial']),
          unit: extractString(responseData, mapping['balance.unit'], 'USD'),
        };
      })()
    : null;

  // Build quota windows
  const daily = extractQuotaWindow(responseData, mapping, 'daily');
  const weekly = extractQuotaWindow(responseData, mapping, 'weekly');
  const monthly = extractQuotaWindow(responseData, mapping, 'monthly');

  // Build token stats
  const todayStats = extractTokenStatsPeriod(responseData, mapping, 'tokenStats.today');
  const totalStats = extractTokenStatsPeriod(responseData, mapping, 'tokenStats.total');
  const rpm = extractNumber(responseData, mapping['tokenStats.rpm']);
  const tpm = extractNumber(responseData, mapping['tokenStats.tpm']);

  const tokenStats =
    todayStats || totalStats || rpm !== null || tpm !== null
      ? {
          today: todayStats,
          total: totalStats,
          rpm,
          tpm,
        }
      : null;

  // Build rate limit
  const rateLimit = (() => {
    const windowSeconds = extractNumber(responseData, mapping['rateLimit.windowSeconds']);
    if (windowSeconds === null) return null;
    return {
      windowSeconds,
      requestsUsed: extractNumber(responseData, mapping['rateLimit.requestsUsed']) ?? 0,
      requestsLimit: extractNumber(responseData, mapping['rateLimit.requestsLimit']),
      costUsed: extractNumber(responseData, mapping['rateLimit.costUsed']) ?? 0,
      costLimit: extractNumber(responseData, mapping['rateLimit.costLimit']),
      remainingSeconds: extractNumber(responseData, mapping['rateLimit.remainingSeconds']) ?? 0,
    };
  })();

  // Compute soonest reset
  const resetsAt = computeSoonestReset({
    ...base,
    resetSemantics: billingMode === 'balance' ? 'expiry' : 'end-of-day',
    balance,
    daily,
    weekly,
    monthly,
    tokenStats,
    rateLimit,
    resetsAt: null,
  });

  // Return immutable result with all extracted fields
  return {
    ...base,
    resetSemantics: billingMode === 'balance' ? 'expiry' : 'end-of-day',
    balance,
    daily,
    weekly,
    monthly,
    tokenStats,
    rateLimit,
    resetsAt,
  };
}
