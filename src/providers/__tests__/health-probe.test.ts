/**
 * Health Probe Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractOrigin, probeHealth, matchHealthResponse, probeHealthWithMetrics } from '../health-probe.js';
import * as http from '../http.js';
import { DEFAULT_TIMEOUT_BUDGET_MS } from '../../core/constants.js';
import { getBuiltInEndpointConfigs } from '../../services/endpoint-config.js';
import type { EndpointConfig, EndpointConfigRegistry } from '../../types/endpoint-config.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeEntry(id: string, healthMatch?: Record<string, string>): EndpointConfig {
  return {
    provider: id,
    endpoint: { path: '/v1/usage', method: 'GET' },
    auth: { type: 'bearer-header' },
    ...(healthMatch !== undefined ? { detection: { healthMatch } } : {}),
    responseMapping: {},
  };
}

function makeRegistry(entries: Record<string, Record<string, string> | undefined>): EndpointConfigRegistry {
  return Object.fromEntries(
    Object.entries(entries).map(([id, hm]) => [id, makeEntry(id, hm)])
  );
}

describe('extractOrigin', () => {
  it('should extract origin from URL with path', () => {
    expect(extractOrigin('https://v2.vexke.com/api')).toBe('https://v2.vexke.com');
  });

  it('should extract origin from URL with deep path', () => {
    expect(extractOrigin('https://api.example.com/v1/claude/stats')).toBe('https://api.example.com');
  });

  it('should handle URL without path', () => {
    expect(extractOrigin('https://example.com')).toBe('https://example.com');
  });

  it('should handle URL with port', () => {
    expect(extractOrigin('https://localhost:3000/api')).toBe('https://localhost:3000');
  });

  it('should handle HTTP URLs', () => {
    expect(extractOrigin('http://localhost:8080/health')).toBe('http://localhost:8080');
  });

  it('should return original URL on parse error', () => {
    expect(extractOrigin('not-a-url')).toBe('not-a-url');
    expect(extractOrigin('')).toBe('');
  });
});

describe('matchHealthResponse', () => {
  describe('exact match', () => {
    const configs = makeRegistry({ 'sub2api': { status: 'ok' } });

    it('should match when all fields equal expected values', () => {
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBe('sub2api');
    });

    it('should return null when field value does not match', () => {
      expect(matchHealthResponse({ status: 'healthy' }, configs)).toBeNull();
    });
  });

  describe('wildcard match', () => {
    const configs = makeRegistry({ 'crs': { service: '*' } });

    it('should match when field exists as string with "*"', () => {
      expect(matchHealthResponse({ service: 'claude-relay-service' }, configs)).toBe('crs');
    });

    it('should not match when field is missing with "*"', () => {
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBeNull();
    });

    it('should not match when field is not a string with "*"', () => {
      expect(matchHealthResponse({ service: 42 }, configs)).toBeNull();
    });
  });

  describe('specificity ordering', () => {
    it('should prefer more-specific config (more fields) when multiple match', () => {
      const configs = makeRegistry({
        'generic': { status: 'ok' },
        'specific': { status: 'ok', version: '*' },
      });
      // Response matches both, but 'specific' has 2 fields so it wins
      const result = matchHealthResponse({ status: 'ok', version: '2.0' }, configs);
      expect(result).toBe('specific');
    });
  });

  describe('empty configs', () => {
    it('should return null when configs is empty', () => {
      expect(matchHealthResponse({ status: 'ok' }, {})).toBeNull();
    });

    it('should return null when no config has healthMatch', () => {
      const configs = makeRegistry({ 'no-match': undefined });
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBeNull();
    });

    it('should not match when healthMatch is empty object {}', () => {
      const configs = makeRegistry({ 'empty-match': {} });
      // Empty healthMatch {} must not vacuously match all responses
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBeNull();
      expect(matchHealthResponse({}, configs)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should not match when an expected field is absent from the response', () => {
      const configs = makeRegistry({ 'provider-a': { status: 'ok', version: '2.0' } });
      // response has status but version is missing entirely
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBeNull();
    });

    it('should match when response has extra fields beyond healthMatch', () => {
      const configs = makeRegistry({ 'provider-b': { status: 'ok' } });
      // Extra fields in response should not interfere
      expect(matchHealthResponse({ status: 'ok', uptime: 12345, region: 'us-east' }, configs)).toBe('provider-b');
    });
  });

  describe('sort tiebreaker', () => {
    it('should use alphabetical providerId order when field counts are equal', () => {
      const configs = makeRegistry({
        'zebra': { status: 'ok' },
        'alpha': { status: 'ok' },
      });
      // Both match with 1 field — 'alpha' < 'zebra' alphabetically, so 'alpha' wins
      expect(matchHealthResponse({ status: 'ok' }, configs)).toBe('alpha');
    });
  });
});

describe('probeHealth', () => {
  let builtInConfigs: EndpointConfigRegistry;

  beforeEach(() => {
    builtInConfigs = getBuiltInEndpointConfigs();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect claude-relay-service from service field', async () => {
    const mockResponse = {
      status: 'healthy',
      service: 'claude-relay-service',
      version: '1.0.0',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://v2.vexke.com/api', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBe('claude-relay-service');
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://v2.vexke.com/health',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
      DEFAULT_TIMEOUT_BUDGET_MS
    );
  });

  it('should detect sub2api from status: ok pattern', async () => {
    const mockResponse = {
      status: 'ok',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://api.sub2api.com', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBe('sub2api');
  });

  it('should return null on timeout', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new http.TimeoutError());

    const result = await probeHealth('https://example.com', 500, builtInConfigs);
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new Error('Network error'));

    const result = await probeHealth('https://example.com', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBeNull();
  });

  it('should return null on HTTP error', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new http.HttpError('404 Not Found', 404));

    const result = await probeHealth('https://example.com', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBeNull();
  });

  it('should return null on invalid JSON', async () => {
    vi.spyOn(http, 'secureFetch').mockResolvedValue('not valid json');

    const result = await probeHealth('https://example.com', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBeNull();
  });

  it('should return null on unrecognized health response pattern', async () => {
    const mockResponse = {
      status: 'operational',
      message: 'All systems go',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://example.com', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(result).toBeNull();
  });

  it('should return null with empty configs even if response has known fields', async () => {
    const mockResponse = { status: 'ok' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://example.com', DEFAULT_TIMEOUT_BUDGET_MS, {});
    expect(result).toBeNull();
  });

  it('should use custom timeout', async () => {
    const mockResponse = { status: 'ok' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    await probeHealth('https://example.com', 3000, builtInConfigs);
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://example.com/health',
      expect.anything(),
      3000
    );
  });

  it('should strip path from base URL before probing', async () => {
    const mockResponse = { status: 'ok' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    await probeHealth('https://v2.vexke.com/api/v1', DEFAULT_TIMEOUT_BUDGET_MS, builtInConfigs);
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://v2.vexke.com/health',
      expect.anything(),
      DEFAULT_TIMEOUT_BUDGET_MS
    );
  });
});

describe('probeHealthWithMetrics', () => {
  const builtInConfigs = getBuiltInEndpointConfigs();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success=true and matchedProvider when probe succeeds', async () => {
    const mockResponse = { status: 'ok', service: 'sub2api' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const registry = makeRegistry({ sub2api: { service: 'sub2api' } });
    const outcome = await probeHealthWithMetrics('https://example.com', 3000, registry);

    expect(outcome.success).toBe(true);
    expect(outcome.matchedProvider).toBe('sub2api');
    expect(outcome.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns success=false and matchedProvider=null when probe fails (network error)', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new Error('Network error'));

    const outcome = await probeHealthWithMetrics('https://example.com', 1000, builtInConfigs);

    expect(outcome.success).toBe(false);
    expect(outcome.matchedProvider).toBeNull();
    expect(outcome.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns success=false when no provider matches', async () => {
    const mockResponse = { unrecognized: 'field' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const outcome = await probeHealthWithMetrics('https://example.com', 3000, builtInConfigs);

    expect(outcome.success).toBe(false);
    expect(outcome.matchedProvider).toBeNull();
  });

  it('measures responseTimeMs', async () => {
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify({ status: 'ok' }));

    const outcome = await probeHealthWithMetrics('https://example.com', 3000, {});

    expect(typeof outcome.responseTimeMs).toBe('number');
    expect(outcome.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});
