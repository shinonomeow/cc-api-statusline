import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCycle } from '../execute-cycle.js';
import type { ExecutionContext } from '../types.js';
import type { EnvSnapshot, Config, CacheEntry, NormalizedUsage } from '../../types/index.js';
import { CACHE_VERSION, DEFAULT_CONFIG, createEmptyNormalizedUsage } from '../../types/index.js';
import type { ProviderAdapter } from '../../providers/index.js';

describe('executeCycle', () => {
  const baseEnv: EnvSnapshot = {
    baseUrl: 'https://api.example.com',
    authToken: 'test-token',
    tokenHash: 'abc123',
    providerOverride: null,
    pollIntervalOverride: null,
  };

  const baseConfig: Config = {
    ...DEFAULT_CONFIG,
    pollIntervalSeconds: 30,
  };

  const mockProvider: ProviderAdapter = {
    fetch: vi.fn(),
  };

  const createMockUsage = (): NormalizedUsage => {
    return createEmptyNormalizedUsage('test-provider', 'subscription', 'Test Plan');
  };

  const createMockEntry = (overrides?: Partial<CacheEntry>): CacheEntry => ({
    version: CACHE_VERSION,
    baseUrl: 'https://api.example.com',
    tokenHash: 'abc123',
    provider: 'test-provider',
    fetchedAt: new Date().toISOString(),
    ttlSeconds: 30,
    data: createMockUsage(),
    renderedLine: 'Test statusline',
    configHash: 'config123',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Path A: Cached renderedLine usable', () => {
    it('should return cached renderedLine when cache is valid and configHash matches', async () => {
      const cachedEntry = createMockEntry({
        renderedLine: 'Cached output',
        configHash: 'config123',
      });

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry,
        providerId: 'test-provider',
        provider: mockProvider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.output).toBe('Cached output');
      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockProvider.fetch).not.toHaveBeenCalled();
    });

    it('should not use cached renderedLine when configHash differs', async () => {
      const cachedEntry = createMockEntry({
        renderedLine: 'Cached output',
        configHash: 'oldconfig',
      });

      const mockFetch = vi.fn().mockResolvedValue(createMockUsage());
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'newconfig',
        cachedEntry,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      // Should re-render from cached data (Path B), not return cached renderedLine
      expect(result.output).not.toBe('Cached output');
      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).not.toBeNull();
      expect(result.cacheUpdate?.configHash).toBe('newconfig');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not use cached renderedLine when provider differs', async () => {
      const cachedEntry = createMockEntry({
        renderedLine: 'Cached output',
        provider: 'old-provider',
      });

      const mockFetch = vi.fn().mockResolvedValue(createMockUsage());
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry,
        providerId: 'new-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      // Should fetch fresh data (Path C), not use cached renderedLine
      expect(result.output).not.toBe('Cached output');
      expect(result.exitCode).toBe(0);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Path B: Cache data valid, config changed', () => {
    it('should re-render from cached data when configHash changes', async () => {
      const cachedEntry = createMockEntry({
        configHash: 'oldconfig',
        renderedLine: 'Old rendering',
      });

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'newconfig',
        cachedEntry,
        providerId: 'test-provider',
        provider: mockProvider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.output).not.toBe('Old rendering');
      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).not.toBeNull();
      expect(result.cacheUpdate?.configHash).toBe('newconfig');
      expect(result.cacheUpdate?.renderedLine).toBe(result.output);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockProvider.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Path C: Fresh fetch succeeds', () => {
    it('should fetch and render when cache is missing', async () => {
      const mockUsage = createMockUsage();
      const mockFetch = vi.fn().mockResolvedValue(mockUsage);
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry: null,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).not.toBeNull();
      expect(result.cacheUpdate?.provider).toBe('test-provider');
      expect(result.cacheUpdate?.configHash).toBe('config123');
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', 'test-token', 800);
    });

    it('should fetch and render when cache is stale', async () => {
      const cachedEntry = createMockEntry({
        fetchedAt: new Date(Date.now() - 60000).toISOString(), // 60s ago
        ttlSeconds: 30, // Expired
      });

      const mockUsage = createMockUsage();
      const mockFetch = vi.fn().mockResolvedValue(mockUsage);
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).not.toBeNull();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should use getEffectivePollInterval for TTL', async () => {
      const mockUsage = createMockUsage();
      const mockFetch = vi.fn().mockResolvedValue(mockUsage);
      const provider: ProviderAdapter = { fetch: mockFetch };

      // Test with env override
      const envWithOverride: EnvSnapshot = {
        ...baseEnv,
        pollIntervalOverride: 60,
      };

      const ctx: ExecutionContext = {
        env: envWithOverride,
        config: { ...baseConfig, pollIntervalSeconds: 30 },
        configHash: 'config123',
        cachedEntry: null,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.cacheUpdate?.ttlSeconds).toBe(60); // Should use env override
    });
  });

  describe('Path D: Fallback scenarios', () => {
    it('should return stale cache when time budget is insufficient', async () => {
      const cachedEntry = createMockEntry({
        renderedLine: 'Stale but valid',
        fetchedAt: new Date(Date.now() - 60000).toISOString(), // Stale
      });

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry,
        providerId: 'test-provider',
        provider: mockProvider,
        timeoutBudgetMs: 100,
        startTime: Date.now() - 60, // Very little time left
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.output).toBe('Stale but valid');
      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockProvider.fetch).not.toHaveBeenCalled();
    });

    it('should return loading message when time budget insufficient and no cache', async () => {
      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry: null,
        providerId: 'test-provider',
        provider: mockProvider,
        timeoutBudgetMs: 100,
        startTime: Date.now() - 60, // Very little time left
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.output).toBe('[loading...]');
      expect(result.exitCode).toBe(0);
      expect(result.cacheUpdate).toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockProvider.fetch).not.toHaveBeenCalled();
    });

    it('should return stale cache with error when fetch fails', async () => {
      const cachedEntry = createMockEntry({
        renderedLine: 'Stale cache',
        fetchedAt: new Date(Date.now() - 60000).toISOString(), // Stale (60s ago)
        ttlSeconds: 30, // Expired
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.exitCode).toBe(0); // Changed from 1 - stale cache output is still useful
      expect(result.cacheUpdate).toBeNull();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should return error message when fetch fails without cache', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const provider: ProviderAdapter = { fetch: mockFetch };

      const ctx: ExecutionContext = {
        env: baseEnv,
        config: baseConfig,
        configHash: 'config123',
        cachedEntry: null,
        providerId: 'test-provider',
        provider,
        timeoutBudgetMs: 1000,
        startTime: Date.now(),
        fetchTimeoutMs: 800,
      };

      const result = await executeCycle(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('test-provider'); // Error message includes provider
      expect(result.cacheUpdate).toBeNull();
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
