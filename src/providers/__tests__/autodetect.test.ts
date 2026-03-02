import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveProvider,
  invalidateDetectionCache,
  clearDetectionCache,
  getDetectionCacheSize,
} from '../autodetect.js';
import * as healthProbe from '../health-probe.js';
import * as cache from '../../services/cache.js';
import { DEFAULT_TIMEOUT_BUDGET_MS } from '../../core/constants.js';

describe('autodetect provider', () => {
  beforeEach(() => {
    clearDetectionCache();
    vi.clearAllMocks();
    vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
    vi.spyOn(cache, 'writeProviderDetectionCache').mockImplementation(() => {});
  });

  afterEach(() => {
    clearDetectionCache();
    vi.restoreAllMocks();
  });

  describe('resolveProvider with override', () => {
    it('should use explicit override when provided', async () => {
      const provider = await resolveProvider(
        'https://api.example.com',
        'my-override',
        {},
        DEFAULT_TIMEOUT_BUDGET_MS
      );
      expect(provider).toBe('my-override');
    });

    it('should bypass cache when override is used', async () => {
      const baseUrl = 'https://api.example.com';

      // Cache with autodetection
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(1);

      // Override should not affect cache
      const provider = await resolveProvider(baseUrl, 'my-override', {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('my-override');
      expect(getDetectionCacheSize()).toBe(1);
    });
  });

  describe('resolveProvider with in-memory cache', () => {
    it('should cache detection results', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);

      // First call - detection
      await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(1);

      // Second call - should use memory cache (no probe)
      await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(1);
      expect(healthProbe.probeHealth).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should cache different URLs separately', async () => {
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);

      await resolveProvider('https://api1.example.com', null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      await resolveProvider('https://api2.example.com', null, {}, DEFAULT_TIMEOUT_BUDGET_MS);

      expect(getDetectionCacheSize()).toBe(2);
    });
  });

  describe('resolveProvider with disk cache', () => {
    it('should use disk cache when available', async () => {
      const baseUrl = 'https://api.example.com';
      const mockDiskCache = {
        baseUrl,
        provider: 'claude-relay-service',
        detectedVia: 'health-probe' as const,
        detectedAt: new Date().toISOString(),
        ttlSeconds: 86400,
      };

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(mockDiskCache);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider = await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('claude-relay-service');
      expect(cache.readProviderDetectionCache).toHaveBeenCalledWith(baseUrl);
      expect(healthProbe.probeHealth).not.toHaveBeenCalled(); // Should not probe if disk cache hit
      expect(getDetectionCacheSize()).toBe(1); // Should populate memory cache
    });

    it('should probe when disk cache is null', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('sub2api');

      const provider = await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('sub2api');
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, DEFAULT_TIMEOUT_BUDGET_MS, {});
    });
  });

  describe('resolveProvider with health probe', () => {
    it('should detect provider via health probe', async () => {
      const baseUrl = 'https://v2.vexke.com/api';
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('claude-relay-service');

      const provider = await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('claude-relay-service');
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, DEFAULT_TIMEOUT_BUDGET_MS, {});
      expect(cache.writeProviderDetectionCache).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          provider: 'claude-relay-service',
          detectedVia: 'health-probe',
        })
      );
    });

    it('should default to sub2api when health probe fails', async () => {
      const baseUrl = 'https://unknown.example.com';
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider = await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('sub2api');
      expect(cache.writeProviderDetectionCache).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          provider: 'sub2api',
          detectedVia: 'health-probe',
        })
      );
    });

    it('should use custom probe timeout', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('sub2api');

      await resolveProvider(baseUrl, null, {}, 3000);
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, 3000, {});
    });

    it('should pass endpointConfigs to health probe', async () => {
      const baseUrl = 'https://api.example.com';
      const endpointConfigs = {
        'custom': {
          provider: 'custom',
          endpoint: { path: '/v1/usage', method: 'GET' as const },
          auth: { type: 'bearer-header' as const },
          detection: { healthMatch: { status: 'custom-ok' } },
          responseMapping: {},
        },
      };

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('custom');

      const provider = await resolveProvider(baseUrl, null, endpointConfigs, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('custom');
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, DEFAULT_TIMEOUT_BUDGET_MS, endpointConfigs);
    });
  });

  describe('cache management', () => {
    it('should invalidate specific cache entry', async () => {
      const baseUrl1 = 'https://api1.example.com';
      const baseUrl2 = 'https://api2.example.com';

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider(baseUrl1, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      await resolveProvider(baseUrl2, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(2);

      invalidateDetectionCache(baseUrl1);
      expect(getDetectionCacheSize()).toBe(1);

      // baseUrl2 should still be cached
      const provider = await resolveProvider(baseUrl2, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(provider).toBe('sub2api');
      expect(getDetectionCacheSize()).toBe(1);
    });

    it('should clear entire cache', async () => {
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider('https://api1.example.com', null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      await resolveProvider('https://api2.example.com', null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(2);

      clearDetectionCache();
      expect(getDetectionCacheSize()).toBe(0);
    });

    it('should re-detect after invalidation', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(1);

      invalidateDetectionCache(baseUrl);
      expect(getDetectionCacheSize()).toBe(0);

      await resolveProvider(baseUrl, null, {}, DEFAULT_TIMEOUT_BUDGET_MS);
      expect(getDetectionCacheSize()).toBe(1);
    });
  });
});
