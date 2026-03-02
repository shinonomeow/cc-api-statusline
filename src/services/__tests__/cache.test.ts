import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isCacheValid,
  isCacheProviderValid,
  isCacheRenderedLineUsable,
  readCache,
  writeCache,
  getCachePath,
  getCacheDir,
  computeConfigHash,
  getCacheAge,
  getEffectivePollInterval,
  readProviderDetectionCache,
  writeProviderDetectionCache,
  getProviderDetectionCachePath,
  deleteProviderDetectionCache,
  readDetectionCacheMeta,
} from '../cache.js';
import type { CacheEntry, EnvSnapshot, Config } from '../../types/index.js';
import { CACHE_VERSION, DEFAULT_CONFIG } from '../../types/index.js';
import { createEmptyNormalizedUsage } from '../../types/index.js';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

describe('cache service', () => {
  let testDir: string;
  let cacheDir: string;
  const originalCacheDirOverride = process.env['CC_API_STATUSLINE_CACHE_DIR'];

  const createEntry = (baseUrl = 'https://api.example.com'): CacheEntry => ({
    version: CACHE_VERSION,
    provider: 'sub2api',
    baseUrl,
    tokenHash: 'abc123',
    configHash: 'def456',
    endpointConfigHash: 'test-hash',
    data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
    renderedLine: 'Test line',
    fetchedAt: new Date().toISOString(),
    ttlSeconds: 30,
    errorState: null,
  });

  beforeEach(() => {
    testDir = join(tmpdir(), `cc-api-cache-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    cacheDir = join(testDir, 'cache');
    process.env['CC_API_STATUSLINE_CACHE_DIR'] = cacheDir;
  });

  afterEach(() => {
    if (originalCacheDirOverride === undefined) {
      delete process.env['CC_API_STATUSLINE_CACHE_DIR'];
    } else {
      process.env['CC_API_STATUSLINE_CACHE_DIR'] = originalCacheDirOverride;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('isCacheValid', () => {
    const baseEnv: EnvSnapshot = {
      baseUrl: 'https://api.example.com',
      authToken: 'token123',
      tokenHash: 'abc123',
      providerOverride: null,
      pollIntervalOverride: null,
    };

    it('should validate fresh cache with matching env', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: baseEnv.baseUrl ?? '',
        tokenHash: baseEnv.tokenHash ?? '',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheValid(entry, baseEnv)).toBe(true);
    });

    it('should invalidate expired cache', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: baseEnv.baseUrl ?? '',
        tokenHash: baseEnv.tokenHash ?? '',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date(Date.now() - 60000).toISOString(), // 60s ago
        ttlSeconds: 30, // TTL 30s
        errorState: null,
      };

      expect(isCacheValid(entry, baseEnv)).toBe(false);
    });

    it('should invalidate cache with different baseUrl', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://other.example.com',
        tokenHash: baseEnv.tokenHash ?? '',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheValid(entry, baseEnv)).toBe(false);
    });

    it('should invalidate cache with different version', () => {
      const entry: CacheEntry = {
        version: 999,
        provider: 'sub2api',
        baseUrl: baseEnv.baseUrl ?? '',
        tokenHash: baseEnv.tokenHash ?? '',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheValid(entry, baseEnv)).toBe(false);
    });

    it('should invalidate cache with different tokenHash', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: baseEnv.baseUrl ?? '',
        tokenHash: 'different',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheValid(entry, baseEnv)).toBe(false);
    });
  });

  describe('isCacheProviderValid', () => {
    it('should validate matching provider', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheProviderValid(entry, 'sub2api')).toBe(true);
    });

    it('should invalidate different provider', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheProviderValid(entry, 'claude-relay-service')).toBe(false);
    });
  });

  describe('isCacheRenderedLineUsable', () => {
    it('should validate matching configHash', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheRenderedLineUsable(entry, 'def456')).toBe(true);
    });

    it('should invalidate different configHash', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 30,
        errorState: null,
      };

      expect(isCacheRenderedLineUsable(entry, 'different')).toBe(false);
    });
  });

  describe('computeConfigHash', () => {
    it('should return sentinel for missing file', () => {
      const hash = computeConfigHash('/nonexistent/config.json');
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(12);
    });

    it('should compute deterministic hash', () => {
      const path = join(testDir, 'test-config.json');
      writeFileSync(path, '{"test": "data"}', 'utf-8');

      const hash1 = computeConfigHash(path);
      const hash2 = computeConfigHash(path);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(12);
    });

    it('should produce different hash for different content', () => {
      const path1 = join(testDir, 'config1.json');
      const path2 = join(testDir, 'config2.json');

      writeFileSync(path1, '{"test": "data1"}', 'utf-8');
      writeFileSync(path2, '{"test": "data2"}', 'utf-8');

      const hash1 = computeConfigHash(path1);
      const hash2 = computeConfigHash(path2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('disk cache IO', () => {
    it('should create cache directory and write cache atomically', () => {
      const baseUrl = 'https://api.example.com';
      const entry = createEntry(baseUrl);

      expect(existsSync(getCacheDir())).toBe(false);

      writeCache(baseUrl, entry);

      const cachePath = getCachePath(baseUrl);
      expect(existsSync(getCacheDir())).toBe(true);
      expect(existsSync(cachePath)).toBe(true);
      expect(existsSync(`${cachePath}.tmp`)).toBe(false);

      const readBack = readCache(baseUrl);
      expect(readBack).toEqual(entry);
    });

    it('should return null for missing cache file', () => {
      const missing = readCache('https://missing.example.com');
      expect(missing).toBeNull();
    });

    it('should return null for corrupted cache JSON (fallback behavior)', () => {
      const baseUrl = 'https://corrupt.example.com';
      const cachePath = getCachePath(baseUrl);
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, '{not-json', 'utf-8');

      const result = readCache(baseUrl);
      expect(result).toBeNull();
    });

    it('should write valid JSON payload to disk', () => {
      const baseUrl = 'https://valid-json.example.com';
      const entry = createEntry(baseUrl);

      writeCache(baseUrl, entry);
      const raw = readFileSync(getCachePath(baseUrl), 'utf-8');

      expect(() => {
        JSON.parse(raw) as unknown;
      }).not.toThrow();
    });
  });

  describe('getCacheAge', () => {
    it('should compute age correctly', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: new Date(Date.now() - 10000).toISOString(), // 10s ago
        ttlSeconds: 30,
        errorState: null,
      };

      const age = getCacheAge(entry);
      expect(age).toBeGreaterThanOrEqual(9);
      expect(age).toBeLessThanOrEqual(11);
    });

    it('should return null for invalid timestamp', () => {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        provider: 'sub2api',
        baseUrl: 'https://api.example.com',
        tokenHash: 'abc123',
        configHash: 'def456',
      endpointConfigHash: 'test-hash',
        data: createEmptyNormalizedUsage('sub2api', 'subscription', 'Test'),
        renderedLine: 'Test line',
        fetchedAt: 'invalid-date',
        ttlSeconds: 30,
        errorState: null,
      };

      const age = getCacheAge(entry);
      expect(age).toBeNull();
    });
  });

  describe('getEffectivePollInterval', () => {
    it('should use env override over config value', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        pollIntervalSeconds: 60,
      };

      const effective = getEffectivePollInterval(config, 45);
      expect(effective).toBe(45);
    });

    it('should use config value when no env override', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        pollIntervalSeconds: 60,
      };

      const effective = getEffectivePollInterval(config, null);
      expect(effective).toBe(60);
    });

    it('should enforce minimum 5 seconds', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        pollIntervalSeconds: 2,
      };

      expect(getEffectivePollInterval(config, null)).toBe(5);
      expect(getEffectivePollInterval(config, 3)).toBe(5);
      expect(getEffectivePollInterval(config, 10)).toBe(10);
    });

    it('should use default when config value missing', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        pollIntervalSeconds: undefined,
      };

      const effective = getEffectivePollInterval(config, null);
      expect(effective).toBe(30); // DEFAULT_POLL_INTERVAL_SECONDS
    });
  });

  describe('provider detection cache', () => {
    describe('getProviderDetectionCachePath', () => {
      it('should return path with provider-detect prefix', () => {
        const path = getProviderDetectionCachePath('https://api.example.com');
        expect(path).toContain('provider-detect-');
        expect(path).toContain('.json');
      });

      it('should return different paths for different URLs', () => {
        const path1 = getProviderDetectionCachePath('https://api1.example.com');
        const path2 = getProviderDetectionCachePath('https://api2.example.com');
        expect(path1).not.toBe(path2);
      });
    });

    describe('writeProviderDetectionCache and readProviderDetectionCache', () => {
      it('should write and read provider detection cache', () => {
        const baseUrl = 'https://api.example.com';
        const entry = {
          baseUrl,
          provider: 'claude-relay-service',
          detectedVia: 'health-probe' as const,
          detectedAt: new Date().toISOString(),
          ttlSeconds: 86400,
        };

        writeProviderDetectionCache(baseUrl, entry);
        const read = readProviderDetectionCache(baseUrl);

        expect(read).not.toBeNull();
        expect(read?.provider).toBe('claude-relay-service');
        expect(read?.detectedVia).toBe('health-probe');
      });

      it('should return null for non-existent cache', () => {
        const read = readProviderDetectionCache('https://nonexistent.example.com');
        expect(read).toBeNull();
      });

      it('should validate TTL and return null for expired cache', () => {
        const baseUrl = 'https://api.example.com';
        const expiredEntry = {
          baseUrl,
          provider: 'sub2api',
          detectedVia: 'health-probe' as const,
          detectedAt: new Date(Date.now() - 90000 * 1000).toISOString(), // 90000 seconds ago
          ttlSeconds: 86400, // 24 hours
        };

        writeProviderDetectionCache(baseUrl, expiredEntry);
        const read = readProviderDetectionCache(baseUrl);

        expect(read).toBeNull(); // Expired
      });

      it('should handle invalid JSON gracefully', () => {
        const baseUrl = 'https://api.example.com';
        const path = getProviderDetectionCachePath(baseUrl);

        // Write invalid JSON
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, 'invalid json{', 'utf-8');

        const read = readProviderDetectionCache(baseUrl);
        expect(read).toBeNull();
      });

      it('should handle invalid cache structure gracefully', () => {
        const baseUrl = 'https://api.example.com';
        const path = getProviderDetectionCachePath(baseUrl);

        // Write invalid structure
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify({ invalid: 'structure' }), 'utf-8');

        const read = readProviderDetectionCache(baseUrl);
        expect(read).toBeNull();
      });

      it('should handle all detection methods', () => {
        const methods: Array<'health-probe' | 'override'> = [
          'health-probe',
          'override',
        ];

        methods.forEach((method, index) => {
          const baseUrl = `https://api${index}.example.com`;
          const entry = {
            baseUrl,
            provider: 'test-provider',
            detectedVia: method,
            detectedAt: new Date().toISOString(),
            ttlSeconds: 86400,
          };

          writeProviderDetectionCache(baseUrl, entry);
          const read = readProviderDetectionCache(baseUrl);

          expect(read).not.toBeNull();
          expect(read?.detectedVia).toBe(method);
        });
      });

      it('should persist and read actual cache values correctly', () => {
        const baseUrl = 'https://v2.vexke.com/api';
        const now = new Date().toISOString();
        const entry = {
          baseUrl,
          provider: 'claude-relay-service',
          detectedVia: 'health-probe' as const,
          detectedAt: now,
          ttlSeconds: 86400,
        };

        writeProviderDetectionCache(baseUrl, entry);
        const read = readProviderDetectionCache(baseUrl);

        expect(read).toEqual(entry);
      });

      it('should handle concurrent writes atomically', () => {
        const baseUrl = 'https://api.example.com';
        const entry1 = {
          baseUrl,
          provider: 'sub2api',
          detectedVia: 'health-probe' as const,
          detectedAt: new Date().toISOString(),
          ttlSeconds: 86400,
        };
        const entry2 = {
          baseUrl,
          provider: 'claude-relay-service',
          detectedVia: 'health-probe' as const,
          detectedAt: new Date().toISOString(),
          ttlSeconds: 86400,
        };

        // Write both
        writeProviderDetectionCache(baseUrl, entry1);
        writeProviderDetectionCache(baseUrl, entry2);

        // Read should get the last write (entry2)
        const read = readProviderDetectionCache(baseUrl);
        expect(read?.provider).toBe('claude-relay-service');
      });
    });

    describe('readDetectionCacheMeta', () => {
      it('returns {ageMs: null, ttlMs: 86400000} when no cache file exists', () => {
        const meta = readDetectionCacheMeta('https://nonexistent.example.com');
        expect(meta.ageMs).toBeNull();
        expect(meta.ttlMs).toBe(86400 * 1000);
      });

      it('returns ageMs and stored ttlMs for a valid cache file', () => {
        const baseUrl = 'https://api.example.com';
        const detectedAt = new Date(Date.now() - 5000).toISOString(); // 5s ago
        writeProviderDetectionCache(baseUrl, {
          baseUrl,
          provider: 'sub2api',
          detectedVia: 'health-probe',
          detectedAt,
          ttlSeconds: 86400,
        });

        const meta = readDetectionCacheMeta(baseUrl);
        expect(meta.ageMs).not.toBeNull();
        expect(meta.ageMs!).toBeGreaterThanOrEqual(4000);
        expect(meta.ageMs!).toBeLessThanOrEqual(7000);
        expect(meta.ttlMs).toBe(86400 * 1000);
      });

      it('returns custom stored TTL converted to ms', () => {
        const baseUrl = 'https://api.example.com';
        writeProviderDetectionCache(baseUrl, {
          baseUrl,
          provider: 'sub2api',
          detectedVia: 'health-probe',
          detectedAt: new Date().toISOString(),
          ttlSeconds: 172800, // 48h
        });

        const meta = readDetectionCacheMeta(baseUrl);
        expect(meta.ttlMs).toBe(172800 * 1000);
      });

      it('returns ageMs even when TTL is expired (does not delete like readProviderDetectionCache)', () => {
        const baseUrl = 'https://api.example.com';
        const detectedAt = new Date(Date.now() - 90001 * 1000).toISOString();
        writeProviderDetectionCache(baseUrl, {
          baseUrl,
          provider: 'sub2api',
          detectedVia: 'health-probe',
          detectedAt,
          ttlSeconds: 1,
        });

        const meta = readDetectionCacheMeta(baseUrl);
        expect(meta.ageMs).not.toBeNull();
        expect(meta.ageMs!).toBeGreaterThan(86400000);
      });

      it('returns {ageMs: null, ttlMs: default} for invalid JSON', () => {
        const baseUrl = 'https://api.example.com';
        const path = getProviderDetectionCachePath(baseUrl);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, 'not-json', 'utf-8');
        const meta = readDetectionCacheMeta(baseUrl);
        expect(meta.ageMs).toBeNull();
        expect(meta.ttlMs).toBe(86400 * 1000);
      });
    });

    describe('deleteProviderDetectionCache', () => {
      it('should delete an existing provider detection cache file', () => {
        const baseUrl = 'https://api.example.com';
        const entry = {
          provider: 'sub2api',
          detectedAt: new Date().toISOString(),
          ttlSeconds: 86400,
        };

        writeProviderDetectionCache(baseUrl, entry);
        const path = getProviderDetectionCachePath(baseUrl);
        expect(existsSync(path)).toBe(true);

        deleteProviderDetectionCache(baseUrl);
        expect(existsSync(path)).toBe(false);
      });

      it('should not throw when file does not exist (ENOENT)', () => {
        const baseUrl = 'https://nonexistent.example.com';
        // Should not throw
        expect(() => deleteProviderDetectionCache(baseUrl)).not.toThrow();
      });

      it('should return undefined (fire-and-forget)', () => {
        const baseUrl = 'https://api.example.com';
        const result = deleteProviderDetectionCache(baseUrl);
        expect(result).toBeUndefined();
      });
    });
  });
});
