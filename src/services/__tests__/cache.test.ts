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
});
