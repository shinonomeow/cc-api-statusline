/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSub2api } from '../sub2api.js';
import { DEFAULT_CONFIG } from '../../types/config.js';
import type { Config } from '../../types/index.js';
import { DEFAULT_TIMEOUT_BUDGET_MS } from '../../core/constants.js';

// Mock the http module
vi.mock('../http.js', () => ({
  secureFetch: vi.fn(),
  HttpError: class HttpError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
      this.name = 'HttpError';
    }
  },
}));

describe('sub2api provider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const httpModule = await import('../http.js');
    mockFetch = (httpModule.secureFetch as unknown) as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  const mockResponse = {
    planName: 'Test Plan',
    remaining: 100,
    unit: 'USD',
    subscription: {
      daily_usage_usd: 5,
      daily_limit_usd: 10,
      weekly_usage_usd: 20,
      weekly_limit_usd: 50,
      monthly_usage_usd: 50,
      monthly_limit_usd: 200,
    },
    usage: {
      today: {
        requests: 100,
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_tokens: 200,
        cache_read_tokens: 300,
        total_tokens: 2000,
        cost: 5,
      },
      total: {
        requests: 500,
        input_tokens: 5000,
        output_tokens: 2500,
        cache_creation_tokens: 1000,
        cache_read_tokens: 1500,
        total_tokens: 10000,
        cost: 50,
      },
      rpm: 60,
      tpm: 10000,
    },
  };

  describe('User-Agent header', () => {
    it('sends User-Agent header when spoofClaudeCodeUA is true', async () => {
      const mockConfig: Config = {
        ...DEFAULT_CONFIG,
        spoofClaudeCodeUA: true,
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchSub2api('https://api.sub2api.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sub2api.com/v1/usage',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        }),
        DEFAULT_TIMEOUT_BUDGET_MS,
        expect.stringMatching(/^claude-cli\/[\d.]+/)
      );
    });

    it('sends custom User-Agent when spoofClaudeCodeUA is string', async () => {
      const mockConfig: Config = {
        ...DEFAULT_CONFIG,
        spoofClaudeCodeUA: 'custom-client/1.0',
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchSub2api('https://api.sub2api.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sub2api.com/v1/usage',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        }),
        DEFAULT_TIMEOUT_BUDGET_MS,
        'custom-client/1.0'
      );
    });

    it('does not send User-Agent when spoofClaudeCodeUA is false', async () => {
      const mockConfig: Config = {
        ...DEFAULT_CONFIG,
        spoofClaudeCodeUA: false,
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchSub2api('https://api.sub2api.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sub2api.com/v1/usage',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        }),
        DEFAULT_TIMEOUT_BUDGET_MS,
        null
      );
    });

    it('does not send User-Agent when spoofClaudeCodeUA is undefined', async () => {
      const mockConfig: Config = {
        ...DEFAULT_CONFIG,
        // spoofClaudeCodeUA undefined
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchSub2api('https://api.sub2api.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sub2api.com/v1/usage',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        }),
        DEFAULT_TIMEOUT_BUDGET_MS,
        null
      );
    });
  });

  describe('resetsAt behavior', () => {
    it('daily resetsAt is null (API does not provide explicit reset timestamps)', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchSub2api('https://api.sub2api.com', 'test-token', DEFAULT_CONFIG);

      expect(result.daily).not.toBeNull();
      if (!result.daily) throw new Error('daily is null');
      // sub2api API doesn't return explicit reset timestamps, so we return null
      // This triggers cost display fallback in the renderer
      expect(result.daily.resetsAt).toBeNull();
    });

    it('weekly resetsAt is null (no computed reset time)', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchSub2api('https://api.sub2api.com', 'test-token', DEFAULT_CONFIG);

      expect(result.weekly).not.toBeNull();
      if (!result.weekly) throw new Error('weekly is null');
      expect(result.weekly.resetsAt).toBeNull();
    });

    it('monthly resetsAt is null (no computed reset time)', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchSub2api('https://api.sub2api.com', 'test-token', DEFAULT_CONFIG);

      expect(result.monthly).not.toBeNull();
      if (!result.monthly) throw new Error('monthly is null');
      expect(result.monthly.resetsAt).toBeNull();
    });
  });

  describe('quota window values', () => {
    it('normalizes USD amounts to correct scale', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchSub2api('https://api.sub2api.com', 'test-token', DEFAULT_CONFIG);

      expect(result.daily).toEqual(
        expect.objectContaining({
          used: 5,
          limit: 10,
          remaining: 5,
        })
      );

      expect(result.weekly).toEqual(
        expect.objectContaining({
          used: 20,
          limit: 50,
          remaining: 30,
        })
      );

      expect(result.monthly).toEqual(
        expect.objectContaining({
          used: 50,
          limit: 200,
          remaining: 150,
        })
      );
    });
  });
});
