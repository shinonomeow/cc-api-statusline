import { vi, describe, it, expect, beforeEach } from 'vitest';
import { validateEndpointConfigSemantics, fetchEndpoint } from '../endpoint-fetch.js';
import { DEFAULT_CONFIG } from '../../types/index.js';
import type { Config } from '../../types/index.js';
import type { EndpointConfig } from '../../types/endpoint-config.js';

vi.mock('../http.js', () => ({
  secureFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeEndpointConfig(overrides: Partial<EndpointConfig> = {}): EndpointConfig {
  return {
    provider: 'test-provider',
    endpoint: { path: '/v1/usage', method: 'GET' },
    auth: { type: 'bearer-header' },
    responseMapping: {
      'daily.used': '$.daily.used',
      'daily.limit': '$.daily.limit',
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

const minimalResponse = JSON.stringify({ daily: { used: 5, limit: 10 } });

// ---------------------------------------------------------------------------
// validateEndpointConfigSemantics
// ---------------------------------------------------------------------------

describe('validateEndpointConfigSemantics', () => {
  it('returns null for a fully valid config', () => {
    expect(validateEndpointConfigSemantics(makeEndpointConfig())).toBeNull();
  });

  it.each([
    [
      'missing provider',
      makeEndpointConfig({ provider: '' }),
      'Endpoint config missing required field: provider',
    ],
    [
      'missing endpoint.path',
      makeEndpointConfig({ endpoint: { path: '', method: 'GET' } }),
      'Endpoint config missing required field: endpoint.path',
    ],
    [
      'missing endpoint.method',
      makeEndpointConfig({ endpoint: { path: '/v1/usage', method: '' as 'GET' } }),
      'Endpoint config missing required field: endpoint.method',
    ],
    [
      'missing auth',
      makeEndpointConfig({ auth: undefined as unknown as EndpointConfig['auth'] }),
      'Endpoint config missing required field: auth',
    ],
    [
      'missing responseMapping',
      makeEndpointConfig({ responseMapping: undefined as unknown as Record<string, string> }),
      'Endpoint config missing required field: responseMapping',
    ],
    [
      'endpoint path without leading slash',
      makeEndpointConfig({ endpoint: { path: 'v1/usage', method: 'GET' } }),
      'Endpoint path must start with /',
    ],
    [
      'custom-header missing header name',
      makeEndpointConfig({ auth: { type: 'custom-header' } }),
      'Auth type="custom-header" requires auth.header',
    ],
    [
      'body-key missing bodyField',
      makeEndpointConfig({ auth: { type: 'body-key' } }),
      'Auth type="body-key" requires auth.bodyField',
    ],
  ])('returns error string for %s', (_label, config, expectedMsg) => {
    expect(validateEndpointConfigSemantics(config)).toBe(expectedMsg);
  });
});

// ---------------------------------------------------------------------------
// fetchEndpoint
// ---------------------------------------------------------------------------

describe('fetchEndpoint', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const httpModule = await import('../http.js');
    mockFetch = httpModule.secureFetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(minimalResponse);
  });

  it('throws when endpoint config is invalid', async () => {
    const badConfig = makeEndpointConfig({ provider: '' });
    await expect(
      fetchEndpoint('https://example.com', 'tok', makeConfig(), badConfig)
    ).rejects.toThrow(/Invalid endpoint config/);
  });

  it('constructs URL from baseUrl + endpoint path', async () => {
    await fetchEndpoint('https://example.com', 'tok', makeConfig(), makeEndpointConfig());
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/usage',
      expect.any(Object),
      expect.any(Number),
      null
    );
  });

  it('sends Authorization: Bearer header for bearer-header auth', async () => {
    await fetchEndpoint('https://example.com', 'my-api-key', makeConfig(), makeEndpointConfig());
    const reqArgs = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }, number, null];
    expect(reqArgs[1].headers['Authorization']).toBe('Bearer my-api-key');
  });

  it('respects a custom bearer prefix', async () => {
    const cfg = makeEndpointConfig({ auth: { type: 'bearer-header', prefix: 'Token ' } });
    await fetchEndpoint('https://example.com', 'key123', makeConfig(), cfg);
    const reqArgs = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }, number, null];
    expect(reqArgs[1].headers['Authorization']).toBe('Token key123');
  });

  it('sends custom header for custom-header auth', async () => {
    const cfg = makeEndpointConfig({ auth: { type: 'custom-header', header: 'X-Api-Key' } });
    await fetchEndpoint('https://example.com', 'secret', makeConfig(), cfg);
    const reqArgs = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }, number, null];
    expect(reqArgs[1].headers['X-Api-Key']).toBe('secret');
  });

  it('injects apiKey into POST body for body-key auth', async () => {
    const cfg = makeEndpointConfig({
      endpoint: { path: '/v1/usage', method: 'POST' },
      auth: { type: 'body-key', bodyField: 'api_key' },
      requestBody: { model: 'default' },
    });
    await fetchEndpoint('https://example.com', 'mykey', makeConfig(), cfg);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'default', api_key: 'mykey' }),
      }),
      expect.any(Number),
      null
    );
  });

  it('passes the timeout argument to secureFetch', async () => {
    await fetchEndpoint('https://example.com', 'tok', makeConfig(), makeEndpointConfig(), 9999);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      9999,
      null
    );
  });

  it('returns a NormalizedUsage object with provider from config', async () => {
    const result = await fetchEndpoint(
      'https://example.com',
      'tok',
      makeConfig(),
      makeEndpointConfig()
    );
    expect(result.provider).toBe('test-provider');
  });

  it('returns daily quota data from mapped response', async () => {
    const result = await fetchEndpoint(
      'https://example.com',
      'tok',
      makeConfig(),
      makeEndpointConfig()
    );
    expect(result.daily?.used).toBe(5);
    expect(result.daily?.limit).toBe(10);
  });

  it('passes null userAgent when endpoint spoofClaudeCodeUA is false', async () => {
    const cfg = makeEndpointConfig({ spoofClaudeCodeUA: false });
    await fetchEndpoint('https://example.com', 'tok', makeConfig({ spoofClaudeCodeUA: true }), cfg);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Number),
      null
    );
  });

  it('passes custom UA string when endpoint spoofClaudeCodeUA is a string', async () => {
    const cfg = makeEndpointConfig({ spoofClaudeCodeUA: 'my-client/1.0' });
    await fetchEndpoint('https://example.com', 'tok', makeConfig(), cfg);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Number),
      'my-client/1.0'
    );
  });
});
