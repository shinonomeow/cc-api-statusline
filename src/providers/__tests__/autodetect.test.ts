import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectProvider,
  resolveProvider,
  invalidateDetectionCache,
  clearDetectionCache,
  getDetectionCacheSize,
} from '../autodetect.js';
import type { CustomProviderConfig } from '../../types/index.js';

describe('autodetect provider', () => {
  beforeEach(() => {
    clearDetectionCache();
  });

  describe('detectProvider', () => {
    it('should detect claude-relay-service from apiStats URL', () => {
      const provider = detectProvider('https://api.example.com/apiStats/api/user-stats');
      expect(provider).toBe('claude-relay-service');
    });

    it('should detect claude-relay-service from relay keyword', () => {
      const provider = detectProvider('https://relay.example.com/api');
      expect(provider).toBe('claude-relay-service');
    });

    it('should detect claude-relay-service from known relay domains', () => {
      const provider1 = detectProvider('https://v2.vexke.com/api');
      const provider2 = detectProvider('https://claude-relay.example.com');
      const provider3 = detectProvider('https://api.clauderelay.com');
      expect(provider1).toBe('claude-relay-service');
      expect(provider2).toBe('claude-relay-service');
      expect(provider3).toBe('claude-relay-service');
    });

    it('should default to sub2api for unknown URLs', () => {
      const provider = detectProvider('https://api.example.com');
      expect(provider).toBe('sub2api');
    });

    it('should be case-insensitive', () => {
      const provider1 = detectProvider('https://API.EXAMPLE.COM/APISTATS');
      const provider2 = detectProvider('https://api.example.com/apistats');
      expect(provider1).toBe('claude-relay-service');
      expect(provider2).toBe('claude-relay-service');
    });

    it('should handle trailing slashes', () => {
      const provider1 = detectProvider('https://api.example.com/');
      const provider2 = detectProvider('https://api.example.com');
      expect(provider1).toBe(provider2);
    });
  });

  describe('detectProvider with custom providers', () => {
    it('should prioritize custom providers over built-in', () => {
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

      const provider = detectProvider('https://custom.example.com/api', customProviders);
      expect(provider).toBe('my-custom');
    });

    it('should match custom provider patterns as substrings', () => {
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

      const provider1 = detectProvider('https://my-proxy.com/v1', customProviders);
      const provider2 = detectProvider('https://proxy.example.org/api', customProviders);
      const provider3 = detectProvider('https://api.my-proxy.com', customProviders);

      expect(provider1).toBe('my-proxy');
      expect(provider2).toBe('my-proxy');
      expect(provider3).toBe('my-proxy');
    });

    it('should check multiple custom providers in order', () => {
      const customProviders: Record<string, CustomProviderConfig> = {
        'provider-a': {
          id: 'provider-a',
          endpoint: '/api',
          method: 'GET',
          auth: { type: 'header', header: 'Auth' },
          urlPatterns: ['provider-a.com'],
          responseMapping: {},
        },
        'provider-b': {
          id: 'provider-b',
          endpoint: '/api',
          method: 'GET',
          auth: { type: 'header', header: 'Auth' },
          urlPatterns: ['provider-b.com'],
          responseMapping: {},
        },
      };

      const provider1 = detectProvider('https://provider-a.com', customProviders);
      const provider2 = detectProvider('https://provider-b.com', customProviders);

      expect(provider1).toBe('provider-a');
      expect(provider2).toBe('provider-b');
    });
  });

  describe('resolveProvider', () => {
    it('should use explicit override when provided', () => {
      const provider = resolveProvider(
        'https://api.example.com',
        'my-override',
        {}
      );
      expect(provider).toBe('my-override');
    });

    it('should autodetect when no override', () => {
      const provider = resolveProvider(
        'https://relay.example.com',
        null,
        {}
      );
      expect(provider).toBe('claude-relay-service');
    });

    it('should cache detection results', () => {
      const baseUrl = 'https://api.example.com';

      // First call - detection
      resolveProvider(baseUrl, null, {});
      expect(getDetectionCacheSize()).toBe(1);

      // Second call - should use cache
      resolveProvider(baseUrl, null, {});
      expect(getDetectionCacheSize()).toBe(1);
    });

    it('should cache different URLs separately', () => {
      resolveProvider('https://api1.example.com', null, {});
      resolveProvider('https://api2.example.com', null, {});

      expect(getDetectionCacheSize()).toBe(2);
    });
  });

  describe('cache management', () => {
    it('should invalidate specific cache entry', () => {
      const baseUrl1 = 'https://api1.example.com';
      const baseUrl2 = 'https://api2.example.com';

      resolveProvider(baseUrl1, null, {});
      resolveProvider(baseUrl2, null, {});
      expect(getDetectionCacheSize()).toBe(2);

      invalidateDetectionCache(baseUrl1);
      expect(getDetectionCacheSize()).toBe(1);

      // baseUrl2 should still be cached
      const provider = resolveProvider(baseUrl2, null, {});
      expect(provider).toBe('sub2api');
      expect(getDetectionCacheSize()).toBe(1);
    });

    it('should clear entire cache', () => {
      resolveProvider('https://api1.example.com', null, {});
      resolveProvider('https://api2.example.com', null, {});
      expect(getDetectionCacheSize()).toBe(2);

      clearDetectionCache();
      expect(getDetectionCacheSize()).toBe(0);
    });

    it('should re-detect after invalidation', () => {
      const baseUrl = 'https://api.example.com';

      resolveProvider(baseUrl, null, {});
      expect(getDetectionCacheSize()).toBe(1);

      invalidateDetectionCache(baseUrl);
      expect(getDetectionCacheSize()).toBe(0);

      resolveProvider(baseUrl, null, {});
      expect(getDetectionCacheSize()).toBe(1);
    });
  });

  describe('override behavior', () => {
    it('should bypass cache when override is used', () => {
      const baseUrl = 'https://api.example.com';

      // Cache with autodetection
      resolveProvider(baseUrl, null, {});
      expect(getDetectionCacheSize()).toBe(1);

      // Override should not affect cache
      const provider = resolveProvider(baseUrl, 'my-override', {});
      expect(provider).toBe('my-override');
      expect(getDetectionCacheSize()).toBe(1);
    });
  });
});
