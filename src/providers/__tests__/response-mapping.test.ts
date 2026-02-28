/**
 * Tests for universal response-mapping module
 *
 * Pure functions — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveJsonPath,
  extractValue,
  extractNumber,
  extractString,
  extractQuotaWindow,
  extractTokenStatsPeriod,
  mapResponseToUsage,
} from '../response-mapping.js';
import type { EndpointConfig } from '../../types/endpoint-config.js';

function makeEndpointConfig(overrides: Partial<EndpointConfig> = {}): EndpointConfig {
  return {
    provider: 'test-provider',
    displayName: 'Test Provider',
    endpoint: { path: '/api/usage', method: 'GET' },
    auth: { type: 'bearer-header' },
    responseMapping: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveJsonPath
// ---------------------------------------------------------------------------

describe('resolveJsonPath', () => {
  const data = {
    user: { name: 'Alice', nested: { value: 42 } },
    items: [{ id: 1, label: 'first' }, { id: 2, label: 'second' }],
    count: 0,
  };

  it('resolves a simple dot-notation path', () => {
    expect(resolveJsonPath(data, '$.user.name')).toBe('Alice');
  });

  it('resolves a deeply nested path', () => {
    expect(resolveJsonPath(data, '$.user.nested.value')).toBe(42);
  });

  it('resolves an array index (first element)', () => {
    expect(resolveJsonPath(data, '$.items[0].label')).toBe('first');
  });

  it('resolves an array index (second element)', () => {
    expect(resolveJsonPath(data, '$.items[1].id')).toBe(2);
  });

  it('returns null for a path that does not exist', () => {
    expect(resolveJsonPath(data, '$.missing.field')).toBeNull();
  });

  it('returns null when an intermediate key is missing', () => {
    expect(resolveJsonPath(data, '$.user.ghost.value')).toBeNull();
  });

  it('returns the path string as literal when it does not start with $.', () => {
    expect(resolveJsonPath(data, 'literal-value')).toBe('literal-value');
  });

  it('correctly resolves falsy zero value (not confused with null)', () => {
    expect(resolveJsonPath(data, '$.count')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractValue
// ---------------------------------------------------------------------------

describe('extractValue', () => {
  const data = { score: 99, label: 'gold' };

  it('resolves a JSONPath mapping', () => {
    expect(extractValue(data, '$.score')).toBe(99);
  });

  it('returns a literal string when no $. prefix', () => {
    expect(extractValue(data, 'hardcoded')).toBe('hardcoded');
  });

  it('returns null (built-in default) when mapping is undefined', () => {
    expect(extractValue(data, undefined)).toBeNull();
  });

  it('returns provided defaultValue when mapping is undefined', () => {
    expect(extractValue(data, undefined, 'fallback')).toBe('fallback');
  });

  it('returns defaultValue when path resolves to null', () => {
    expect(extractValue(data, '$.missing', 'default')).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// extractNumber
// ---------------------------------------------------------------------------

describe('extractNumber', () => {
  it('returns a number from a numeric field', () => {
    expect(extractNumber({ value: 42 }, '$.value')).toBe(42);
  });

  it('parses a string representation of a float', () => {
    expect(extractNumber({ value: '3.14' }, '$.value')).toBe(3.14);
  });

  it('returns null for a non-numeric string', () => {
    expect(extractNumber({ value: 'abc' }, '$.value')).toBeNull();
  });

  it('returns null when the field is missing', () => {
    expect(extractNumber({}, '$.missing')).toBeNull();
  });

  it('returns null when mapping is undefined', () => {
    expect(extractNumber({ value: 5 }, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractString
// ---------------------------------------------------------------------------

describe('extractString', () => {
  it('returns a string value directly', () => {
    expect(extractString({ name: 'test' }, '$.name')).toBe('test');
  });

  it('coerces a number to a string', () => {
    expect(extractString({ value: 42 }, '$.value')).toBe('42');
  });

  it('returns the provided default when the field is missing', () => {
    expect(extractString({}, '$.missing', 'default')).toBe('default');
  });

  it('returns empty string (built-in default) when mapping is undefined', () => {
    expect(extractString({}, undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractQuotaWindow
// ---------------------------------------------------------------------------

describe('extractQuotaWindow', () => {
  it('returns null when the used field is absent', () => {
    expect(extractQuotaWindow({}, {}, 'daily')).toBeNull();
  });

  it('extracts a fully populated quota window with remaining computed', () => {
    const data = { daily: { used: 10, limit: 50, resetsAt: '2024-03-15T00:00:00Z' } };
    const mapping = {
      'daily.used': '$.daily.used',
      'daily.limit': '$.daily.limit',
      'daily.resetsAt': '$.daily.resetsAt',
    };
    const result = extractQuotaWindow(data, mapping, 'daily');
    expect(result).toEqual({ used: 10, limit: 50, remaining: 40, resetsAt: '2024-03-15T00:00:00Z' });
  });

  it('treats limit = 0 as null (unlimited) and sets remaining to null', () => {
    const data = { daily: { used: 5, limit: 0 } };
    const mapping = { 'daily.used': '$.daily.used', 'daily.limit': '$.daily.limit' };
    const result = extractQuotaWindow(data, mapping, 'daily');
    expect(result?.limit).toBeNull();
    expect(result?.remaining).toBeNull();
  });

  it('clamps remaining to 0 when used exceeds limit', () => {
    const data = { daily: { used: 80, limit: 50 } };
    const mapping = { 'daily.used': '$.daily.used', 'daily.limit': '$.daily.limit' };
    const result = extractQuotaWindow(data, mapping, 'daily');
    expect(result?.remaining).toBe(0);
  });

  it('works for the weekly prefix', () => {
    const data = { weekly: { used: 20, limit: 100, resetsAt: '2024-03-18T00:00:00Z' } };
    const mapping = {
      'weekly.used': '$.weekly.used',
      'weekly.limit': '$.weekly.limit',
      'weekly.resetsAt': '$.weekly.resetsAt',
    };
    const result = extractQuotaWindow(data, mapping, 'weekly');
    expect(result?.used).toBe(20);
    expect(result?.remaining).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// extractTokenStatsPeriod
// ---------------------------------------------------------------------------

describe('extractTokenStatsPeriod', () => {
  it('returns null when the requests field is absent', () => {
    expect(extractTokenStatsPeriod({}, {}, 'tokenStats.today')).toBeNull();
  });

  it('extracts all token fields when fully mapped', () => {
    const data = {
      today: {
        requests: 100, inputTokens: 1000, outputTokens: 500,
        cacheCreationTokens: 50, cacheReadTokens: 25, totalTokens: 1575, cost: 0.05,
      },
    };
    const mapping = {
      'tokenStats.today.requests': '$.today.requests',
      'tokenStats.today.inputTokens': '$.today.inputTokens',
      'tokenStats.today.outputTokens': '$.today.outputTokens',
      'tokenStats.today.cacheCreationTokens': '$.today.cacheCreationTokens',
      'tokenStats.today.cacheReadTokens': '$.today.cacheReadTokens',
      'tokenStats.today.totalTokens': '$.today.totalTokens',
      'tokenStats.today.cost': '$.today.cost',
    };
    const result = extractTokenStatsPeriod(data, mapping, 'tokenStats.today');
    expect(result).toEqual({
      requests: 100, inputTokens: 1000, outputTokens: 500,
      cacheCreationTokens: 50, cacheReadTokens: 25, totalTokens: 1575, cost: 0.05,
    });
  });

  it('defaults cacheCreationTokens, cacheReadTokens, totalTokens to 0 when unmapped', () => {
    const data = { total: { requests: 50, inputTokens: 200, outputTokens: 100, cost: 0.01 } };
    const mapping = {
      'tokenStats.total.requests': '$.total.requests',
      'tokenStats.total.inputTokens': '$.total.inputTokens',
      'tokenStats.total.outputTokens': '$.total.outputTokens',
      'tokenStats.total.cost': '$.total.cost',
    };
    const result = extractTokenStatsPeriod(data, mapping, 'tokenStats.total');
    expect(result?.cacheCreationTokens).toBe(0);
    expect(result?.cacheReadTokens).toBe(0);
    expect(result?.totalTokens).toBe(0);
  });

  it('works for the tokenStats.total prefix', () => {
    const data = { total: { requests: 999 } };
    const mapping = { 'tokenStats.total.requests': '$.total.requests' };
    const result = extractTokenStatsPeriod(data, mapping, 'tokenStats.total');
    expect(result?.requests).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// mapResponseToUsage
// ---------------------------------------------------------------------------

describe('mapResponseToUsage', () => {
  it('sets provider from EndpointConfig', () => {
    const config = makeEndpointConfig({ provider: 'my-api' });
    expect(mapResponseToUsage({}, {}, config).provider).toBe('my-api');
  });

  it('defaults billingMode to subscription when field is absent', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).billingMode).toBe('subscription');
  });

  it('maps billingMode to balance when response says balance', () => {
    const result = mapResponseToUsage({ mode: 'balance' }, { billingMode: '$.mode' }, makeEndpointConfig());
    expect(result.billingMode).toBe('balance');
  });

  it('sets resetSemantics to expiry for balance billing mode', () => {
    const result = mapResponseToUsage({ bm: 'balance' }, { billingMode: '$.bm' }, makeEndpointConfig());
    expect(result.resetSemantics).toBe('expiry');
  });

  it('sets resetSemantics to end-of-day for subscription billing mode', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).resetSemantics).toBe('end-of-day');
  });

  it('uses displayName as planName fallback', () => {
    const config = makeEndpointConfig({ displayName: 'My Display Name' });
    expect(mapResponseToUsage({}, {}, config).planName).toBe('My Display Name');
  });

  it('uses provider as planName fallback when displayName is absent', () => {
    const config = makeEndpointConfig({ provider: 'fallback-provider', displayName: undefined });
    expect(mapResponseToUsage({}, {}, config).planName).toBe('fallback-provider');
  });

  it('extracts planName from response mapping', () => {
    const result = mapResponseToUsage({ plan: 'Pro Plan' }, { planName: '$.plan' }, makeEndpointConfig());
    expect(result.planName).toBe('Pro Plan');
  });

  it('extracts balance info when balance.remaining is mapped', () => {
    const data = { credits: { remaining: 25.5, initial: 100, unit: 'USD' } };
    const mapping = {
      'balance.remaining': '$.credits.remaining',
      'balance.initial': '$.credits.initial',
      'balance.unit': '$.credits.unit',
    };
    const result = mapResponseToUsage(data, mapping, makeEndpointConfig());
    expect(result.balance).toEqual({ remaining: 25.5, initial: 100, unit: 'USD' });
  });

  it('sets balance to null when balance.remaining is not mapped', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).balance).toBeNull();
  });

  it('extracts daily quota window', () => {
    const data = { daily: { used: 10, limit: 50, resetsAt: '2024-03-15T00:00:00Z' } };
    const mapping = {
      'daily.used': '$.daily.used',
      'daily.limit': '$.daily.limit',
      'daily.resetsAt': '$.daily.resetsAt',
    };
    const result = mapResponseToUsage(data, mapping, makeEndpointConfig());
    expect(result.daily).toEqual({ used: 10, limit: 50, remaining: 40, resetsAt: '2024-03-15T00:00:00Z' });
  });

  it('sets rateLimit to null when windowSeconds is not mapped', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).rateLimit).toBeNull();
  });

  it('extracts rateLimit when windowSeconds is mapped', () => {
    const data = { rl: { windowSeconds: 60, requestsUsed: 5, requestsLimit: 100, costUsed: 0.01, costLimit: 1.0, remainingSeconds: 30 } };
    const mapping = {
      'rateLimit.windowSeconds': '$.rl.windowSeconds',
      'rateLimit.requestsUsed': '$.rl.requestsUsed',
      'rateLimit.requestsLimit': '$.rl.requestsLimit',
      'rateLimit.costUsed': '$.rl.costUsed',
      'rateLimit.costLimit': '$.rl.costLimit',
      'rateLimit.remainingSeconds': '$.rl.remainingSeconds',
    };
    const result = mapResponseToUsage(data, mapping, makeEndpointConfig());
    expect(result.rateLimit).toEqual({
      windowSeconds: 60, requestsUsed: 5, requestsLimit: 100,
      costUsed: 0.01, costLimit: 1.0, remainingSeconds: 30,
    });
  });

  it('computes resetsAt as the soonest reset across windows', () => {
    const data = {
      daily: { used: 10, limit: 50, resetsAt: '2024-03-15T00:00:00Z' },
      weekly: { used: 20, limit: 100, resetsAt: '2024-03-18T00:00:00Z' },
    };
    const mapping = {
      'daily.used': '$.daily.used', 'daily.limit': '$.daily.limit', 'daily.resetsAt': '$.daily.resetsAt',
      'weekly.used': '$.weekly.used', 'weekly.limit': '$.weekly.limit', 'weekly.resetsAt': '$.weekly.resetsAt',
    };
    expect(mapResponseToUsage(data, mapping, makeEndpointConfig()).resetsAt).toBe('2024-03-15T00:00:00Z');
  });

  it('sets resetsAt to null when no quota windows are present', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).resetsAt).toBeNull();
  });

  it('populates tokenStats when today stats are mapped', () => {
    const data = { today: { requests: 10, inputTokens: 100, outputTokens: 50, cost: 0.01 } };
    const mapping = {
      'tokenStats.today.requests': '$.today.requests',
      'tokenStats.today.inputTokens': '$.today.inputTokens',
      'tokenStats.today.outputTokens': '$.today.outputTokens',
      'tokenStats.today.cost': '$.today.cost',
    };
    const result = mapResponseToUsage(data, mapping, makeEndpointConfig());
    expect(result.tokenStats?.today?.requests).toBe(10);
  });

  it('sets tokenStats to null when no token fields are mapped', () => {
    expect(mapResponseToUsage({}, {}, makeEndpointConfig()).tokenStats).toBeNull();
  });
});
