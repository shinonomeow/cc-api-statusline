/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchClaudeRelayService } from '../claude-relay-service.js';
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

describe('claude-relay-service provider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const httpModule = await import('../http.js');
    mockFetch = vi.mocked(httpModule.secureFetch) as unknown as ReturnType<typeof vi.fn>;
  });

  const mockResponse = {
    success: true,
    data: {
      name: 'Test Key',
      limits: {
        currentDailyCost: 5,
        dailyCostLimit: 10,
        weeklyOpusCost: 20,
        weeklyOpusCostLimit: 50,
        weeklyResetDay: 1,
        weeklyResetHour: 0,
        rateLimitWindow: 60,
        currentWindowRequests: 100,
        rateLimitRequests: 1000,
        currentWindowCost: 2,
        rateLimitCost: 10,
        windowRemainingSeconds: 3000,
        windowEndTime: Date.now() + 3000000,
        windowStartTime: Date.now() - 600000,
      },
      usage: {
        total: {
          requests: 500,
          inputTokens: 5000,
          outputTokens: 2500,
          cacheCreateTokens: 1000,
          cacheReadTokens: 1500,
          tokens: 10000,
          cost: 50,
        },
      },
    },
  };

  describe('User-Agent header', () => {
    it('sends User-Agent header when spoofClaudeCodeUA is true', async () => {
      const mockConfig: Config = {
        ...DEFAULT_CONFIG,
        spoofClaudeCodeUA: true,
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchClaudeRelayService('https://relay.example.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://relay.example.com/apiStats/api/user-stats',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
          body: JSON.stringify({ apiKey: 'test-token' }),
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

      await fetchClaudeRelayService('https://relay.example.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://relay.example.com/apiStats/api/user-stats',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
          body: JSON.stringify({ apiKey: 'test-token' }),
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

      await fetchClaudeRelayService('https://relay.example.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://relay.example.com/apiStats/api/user-stats',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
          body: JSON.stringify({ apiKey: 'test-token' }),
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

      await fetchClaudeRelayService('https://relay.example.com', 'test-token', mockConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://relay.example.com/apiStats/api/user-stats',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
          body: JSON.stringify({ apiKey: 'test-token' }),
        }),
        5000,
        null
      );
    });
  });

  describe('URL construction', () => {
    it('should construct URL using origin, not full baseUrl with path', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchClaudeRelayService('https://v2.vexke.com/api', 'test-token', DEFAULT_CONFIG);

      // Should use https://v2.vexke.com (origin) not https://v2.vexke.com/api
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v2.vexke.com/apiStats/api/user-stats',
        expect.anything(),
        5000,
        null
      );
    });

    it('should handle baseUrl without path correctly', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://relay.example.com/apiStats/api/user-stats',
        expect.anything(),
        5000,
        null
      );
    });

    it('should handle baseUrl with deep path correctly', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchClaudeRelayService('https://api.example.com/v1/claude', 'test-token', DEFAULT_CONFIG);

      // Should extract origin and use it
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/apiStats/api/user-stats',
        expect.anything(),
        5000,
        null
      );
    });

    it('should handle baseUrl with port correctly', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      await fetchClaudeRelayService('https://localhost:3000/api', 'test-token', DEFAULT_CONFIG);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:3000/apiStats/api/user-stats',
        expect.anything(),
        5000,
        null
      );
    });
  });

  describe('countdown reset times', () => {
    it('should provide resetsAt for daily quota', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(result.daily).not.toBeNull();
      expect(result.daily?.resetsAt).not.toBeNull();
      expect(result.daily?.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should provide resetsAt for weekly quota with reset day/hour', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(result.weekly).not.toBeNull();
      expect(result.weekly?.resetsAt).not.toBeNull();
      expect(result.weekly?.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return null resetsAt for weekly quota without reset day/hour (cost fallback)', async () => {
      const responseWithoutWeeklyReset = {
        ...mockResponse,
        data: {
          ...mockResponse.data,
          limits: {
            ...mockResponse.data.limits,
            weeklyResetDay: undefined,
            weeklyResetHour: undefined,
          },
        },
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(responseWithoutWeeklyReset));

      const result = await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(result.weekly).not.toBeNull();
      // When reset day/hour not available, resetsAt should be null (triggers cost fallback display)
      expect(result.weekly?.resetsAt).toBeNull();
    });

    it('should use windowEndTime for top-level resetsAt when available', async () => {
      mockFetch.mockResolvedValueOnce(JSON.stringify(mockResponse));

      const result = await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(result.resetsAt).not.toBeNull();
      expect(result.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should fallback to computeSoonestReset when windowEndTime is missing', async () => {
      const responseWithoutWindowEndTime = {
        ...mockResponse,
        data: {
          ...mockResponse.data,
          limits: {
            ...mockResponse.data.limits,
            windowEndTime: null,
          },
        },
      };

      mockFetch.mockResolvedValueOnce(JSON.stringify(responseWithoutWindowEndTime));

      const result = await fetchClaudeRelayService('https://relay.example.com', 'test-token', DEFAULT_CONFIG);

      expect(result.resetsAt).not.toBeNull();
      expect(result.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
