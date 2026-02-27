import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveProvider,
  invalidateDetectionCache,
  clearDetectionCache,
  getDetectionCacheSize,
} from '../autodetect.js';
import type { CustomProviderConfig } from '../../types/index.js';
import * as healthProbe from '../health-probe.js';
import * as cache from '../../services/cache.js';

describe('autodetect provider', () => {
  beforeEach(() => {
    clearDetectionCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveProvider with override', () => {
    it('should use explicit override when provided', async () => {
      const provider = await resolveProvider(
        'https://api.example.com',
        'my-override',
        {},
        1500
      );
      expect(provider).toBe('my-override');
    });

    it('should bypass cache when override is used', async () => {
      const baseUrl = 'https://api.example.com';

      // Cache with autodetection
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      await resolveProvider(baseUrl, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(1);

      // Override should not affect cache
      const provider = await resolveProvider(baseUrl, 'my-override', {}, 1500);
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
      await resolveProvider(baseUrl, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(1);

      // Second call - should use memory cache (no probe)
      await resolveProvider(baseUrl, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(1);
      expect(healthProbe.probeHealth).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should cache different URLs separately', async () => {
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);

      await resolveProvider('https://api1.example.com', null, {}, 1500);
      await resolveProvider('https://api2.example.com', null, {}, 1500);

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

      const provider = await resolveProvider(baseUrl, null, {}, 1500);
      expect(provider).toBe('claude-relay-service');
      expect(cache.readProviderDetectionCache).toHaveBeenCalledWith(baseUrl);
      expect(healthProbe.probeHealth).not.toHaveBeenCalled(); // Should not probe if disk cache hit
      expect(getDetectionCacheSize()).toBe(1); // Should populate memory cache
    });

    it('should probe when disk cache is null', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('sub2api');

      const provider = await resolveProvider(baseUrl, null, {}, 1500);
      expect(provider).toBe('sub2api');
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, 1500);
    });
  });

  describe('resolveProvider with custom providers', () => {
    it('should prioritize custom providers with URL patterns', async () => {
      const customProviders: Record<string, CustomProviderConfig> = {
        'my-custom': {
          id: 'my-custom',
          endpoint: '/api/usage',
          method: 'GET',
          auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
          urlPatterns: ['custom.example.com'],
          responseMapping: {},
        },
      };

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider = await resolveProvider('https://custom.example.com/api', null, customProviders, 1500);
      expect(provider).toBe('my-custom');
      expect(healthProbe.probeHealth).not.toHaveBeenCalled(); // URL pattern should match before probe
    });

    it('should match custom provider patterns as substrings', async () => {
      const customProviders: Record<string, CustomProviderConfig> = {
        'my-proxy': {
          id: 'my-proxy',
          endpoint: '/usage',
          method: 'GET',
          auth: { type: 'header', header: 'X-API-Key' },
          urlPatterns: ['my-proxy.com', 'proxy.example'],
          responseMapping: {},
        },
      };

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider1 = await resolveProvider('https://my-proxy.com/v1', null, customProviders, 1500);
      const provider2 = await resolveProvider('https://proxy.example.org/api', null, customProviders, 1500);
      const provider3 = await resolveProvider('https://api.my-proxy.com', null, customProviders, 1500);

      expect(provider1).toBe('my-proxy');
      expect(provider2).toBe('my-proxy');
      expect(provider3).toBe('my-proxy');
    });
  });

  describe('resolveProvider with health probe', () => {
    it('should detect provider via health probe', async () => {
      const baseUrl = 'https://v2.vexke.com/api';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('claude-relay-service');
      vi.spyOn(cache, 'writeProviderDetectionCache').mockImplementation(() => {});

      const provider = await resolveProvider(baseUrl, null, {}, 1500);
      expect(provider).toBe('claude-relay-service');
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, 1500);
      expect(cache.writeProviderDetectionCache).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          provider: 'claude-relay-service',
          detectedVia: 'health-probe',
        })
      );
    });

    it('should fall back to URL pattern when health probe fails', async () => {
      const baseUrl = 'https://api.example.com/apiStats/api/user-stats';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      vi.spyOn(cache, 'writeProviderDetectionCache').mockImplementation(() => {});

      const provider = await resolveProvider(baseUrl, null, {}, 1500);
      expect(provider).toBe('claude-relay-service');
      expect(cache.writeProviderDetectionCache).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          provider: 'claude-relay-service',
          detectedVia: 'url-pattern',
        })
      );
    });

    it('should default to sub2api when probe fails and no URL pattern matches', async () => {
      const baseUrl = 'https://unknown.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);
      vi.spyOn(cache, 'writeProviderDetectionCache').mockImplementation(() => {});

      const provider = await resolveProvider(baseUrl, null, {}, 1500);
      expect(provider).toBe('sub2api');
      expect(cache.writeProviderDetectionCache).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          provider: 'sub2api',
          detectedVia: 'url-pattern',
        })
      );
    });

    it('should use custom probe timeout', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue('sub2api');

      await resolveProvider(baseUrl, null, {}, 3000);
      expect(healthProbe.probeHealth).toHaveBeenCalledWith(baseUrl, 3000);
    });
  });

  describe('URL pattern detection', () => {
    it('should detect claude-relay-service from apiStats URL', async () => {
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider = await resolveProvider('https://api.example.com/apiStats/api/user-stats', null, {}, 1500);
      expect(provider).toBe('claude-relay-service');
    });

    it('should be case-insensitive', async () => {
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      const provider1 = await resolveProvider('https://API.EXAMPLE.COM/APISTATS', null, {}, 1500);
      const provider2 = await resolveProvider('https://api.example.com/apistats', null, {}, 1500);
      expect(provider1).toBe('claude-relay-service');
      expect(provider2).toBe('claude-relay-service');
    });
  });

  describe('cache management', () => {
    it('should invalidate specific cache entry', async () => {
      const baseUrl1 = 'https://api1.example.com';
      const baseUrl2 = 'https://api2.example.com';

      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider(baseUrl1, null, {}, 1500);
      await resolveProvider(baseUrl2, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(2);

      invalidateDetectionCache(baseUrl1);
      expect(getDetectionCacheSize()).toBe(1);

      // baseUrl2 should still be cached
      const provider = await resolveProvider(baseUrl2, null, {}, 1500);
      expect(provider).toBe('sub2api');
      expect(getDetectionCacheSize()).toBe(1);
    });

    it('should clear entire cache', async () => {
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider('https://api1.example.com', null, {}, 1500);
      await resolveProvider('https://api2.example.com', null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(2);

      clearDetectionCache();
      expect(getDetectionCacheSize()).toBe(0);
    });

    it('should re-detect after invalidation', async () => {
      const baseUrl = 'https://api.example.com';
      vi.spyOn(cache, 'readProviderDetectionCache').mockReturnValue(null);
      vi.spyOn(healthProbe, 'probeHealth').mockResolvedValue(null);

      await resolveProvider(baseUrl, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(1);

      invalidateDetectionCache(baseUrl);
      expect(getDetectionCacheSize()).toBe(0);

      await resolveProvider(baseUrl, null, {}, 1500);
      expect(getDetectionCacheSize()).toBe(1);
    });
  });
});
