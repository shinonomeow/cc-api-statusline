/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSub2api } from '../sub2api.js';
import { DEFAULT_CONFIG } from '../../types/config.js';
import type { Config } from '../../types/index.js';

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
    mockFetch = vi.mocked(httpModule.secureFetch) as unknown as ReturnType<typeof vi.fn>;
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
        5000,
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
        5000,
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
        5000,
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
        5000,
        null
      );
    });
  });
});
