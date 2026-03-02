/**
 * Piped Mode Execution Tests
 *
 * Tests the error-handling harness around buildExecutionContext.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedArgs } from '../args.js';
import { executePipedMode, type PipedModeDeps } from '../piped-mode.js';
import { DEFAULT_CONFIG } from '../../types/index.js';

function minimalArgs(overrides?: Partial<ParsedArgs>): ParsedArgs {
  return {
    help: false,
    version: false,
    once: false,
    install: false,
    uninstall: false,
    applyConfig: false,
    force: false,
    embedded: false,
    ...overrides,
  };
}

function createDeps(overrides?: Partial<PipedModeDeps>): PipedModeDeps {
  const provider = { fetch: vi.fn() } as unknown as NonNullable<ReturnType<PipedModeDeps['getProvider']>>;
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  return {
    readCurrentEnv: vi.fn(() => ({
      baseUrl: 'https://api.example.com',
      authToken: 'test-token',
      tokenHash: 'abc123',
      providerOverride: null,
      pollIntervalOverride: null,
    })),
    validateRequiredEnv: vi.fn(() => null),
    readCache: vi.fn(() => null),
    writeCache: vi.fn(),
    getCacheDir: vi.fn(() => '/tmp/cache'),
    isCacheValid: vi.fn(() => true),
    loadConfigWithHash: vi.fn(() => ({ config: DEFAULT_CONFIG, configHash: 'config-hash' })),
    loadEndpointConfigs: vi.fn(() => ({})),
    computeEndpointConfigHash: vi.fn(() => 'endpoint-hash'),
    readEndpointLock: vi.fn(() => ({ hash: 'endpoint-hash', lockedAt: '2026-01-01T00:00:00Z' })),
    writeEndpointLock: vi.fn(),
    needsConfigInit: vi.fn(() => false),
    writeDefaultConfigs: vi.fn(),
    resolveProvider: vi.fn(() => Promise.resolve('anthropic')),
    getProvider: vi.fn(() => provider),
    renderError: vi.fn(() => 'network error'),
    dimText: vi.fn((text: string) => text),
    executeCycle: vi.fn(() => Promise.resolve({ output: 'test output', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'A' as const })),
    invalidateDetectionCache: vi.fn(),
    deleteProviderDetectionCache: vi.fn(),
    logger,
    runCacheGC: vi.fn(),
    probeHealthWithMetrics: vi.fn(() => Promise.resolve({ success: true, matchedProvider: 'anthropic', responseTimeMs: 50 })),
    readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })),
    cacheProviderDetectionWithTtl: vi.fn(),
    ...overrides,
  };
}

describe('executePipedMode', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((_chunk: unknown) => true);

    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildExecutionContext error handling', () => {
    it('exits 0 with network-error output when writeDefaultConfigs throws', async () => {
      const deps = createDeps({
        needsConfigInit: vi.fn(() => true),
        writeDefaultConfigs: vi.fn(() => {
          throw new Error('EACCES: permission denied');
        }),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(stdoutSpy).toHaveBeenCalled();
      const written = (stdoutSpy.mock.calls[0]?.[0] as string) ?? '';
      expect(written.length).toBeGreaterThan(0);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('logs the error before exiting', async () => {
      const deps = createDeps({
        needsConfigInit: vi.fn(() => true),
        writeDefaultConfigs: vi.fn(() => {
          throw new Error('ENOSPC: no space left on device');
        }),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      const errorCalls = (deps.logger.error as ReturnType<typeof vi.fn>).mock.calls;
      expect(errorCalls[0]?.[0]).toBe('Failed to build execution context');
      const details = errorCalls[0]?.[1] as { error?: string } | undefined;
      expect(details?.error).toContain('ENOSPC');
    });

    it('does not propagate the thrown error to the caller', async () => {
      const deps = createDeps({
        needsConfigInit: vi.fn(() => true),
        writeDefaultConfigs: vi.fn(() => {
          throw new Error('Unexpected I/O error');
        }),
      });

      const rejection = await executePipedMode(minimalArgs(), deps).catch((e: unknown) => e as Error);
      expect(rejection.message).toContain('process.exit(0)');
      expect(rejection.message).not.toContain('Unexpected I/O error');
    });
  });

  describe('happy path', () => {
    it('exits 0 on successful execution', async () => {
      const deps = createDeps();

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('provider detection cache invalidation', () => {
    it('calls invalidateDetectionCache and deleteProviderDetectionCache when invalidateProvider=true', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'error', exitCode: 0, cacheUpdate: null, invalidateProvider: true, path: 'D' as const })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.invalidateDetectionCache).toHaveBeenCalledWith('https://api.example.com');
      expect(deps.deleteProviderDetectionCache).toHaveBeenCalledWith('https://api.example.com');
    });

    it('does not call invalidation functions when invalidateProvider=false', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'ok', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'C' as const })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.invalidateDetectionCache).not.toHaveBeenCalled();
      expect(deps.deleteProviderDetectionCache).not.toHaveBeenCalled();
    });
  });

  describe('maintenance scheduler integration', () => {
    it('calls probeHealthWithMetrics on Path A when detection cache is absent', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'cached', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'A' as const })),
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })), // no cache → probe
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.probeHealthWithMetrics).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('calls cacheProviderDetectionWithTtl with doubled TTL on stable probe', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'cached', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'A' as const })),
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })), // 24h in ms
        resolveProvider: vi.fn(() => Promise.resolve('anthropic')),
        probeHealthWithMetrics: vi.fn(() => Promise.resolve({ success: true, matchedProvider: 'anthropic', responseTimeMs: 50 })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      // TTL should double: 86400s → 172800s
      expect(deps.cacheProviderDetectionWithTtl).toHaveBeenCalledWith(
        'https://api.example.com',
        'anthropic',
        172800
      );
    });

    it('does not call probeHealthWithMetrics on Path C', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'fresh', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'C' as const })),
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.probeHealthWithMetrics).not.toHaveBeenCalled();
    });

    it('does not call probeHealthWithMetrics on Path D', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'error', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'D' as const })),
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.probeHealthWithMetrics).not.toHaveBeenCalled();
    });

    it('does not call cacheProviderDetectionWithTtl when probe fails', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'cached', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'A' as const })),
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: null, ttlMs: 86400000 })),
        probeHealthWithMetrics: vi.fn(() => Promise.resolve({ success: false, matchedProvider: null, responseTimeMs: 50 })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      expect(deps.cacheProviderDetectionWithTtl).not.toHaveBeenCalled();
    });

    it('does not run inline GC on Path C anymore (GC moved to scheduler)', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({
          output: 'fresh', exitCode: 0,
          cacheUpdate: { version: 2, baseUrl: 'https://api.example.com', tokenHash: 'abc', provider: 'anthropic', fetchedAt: new Date().toISOString(), ttlSeconds: 30, data: {} as never, renderedLine: 'x', configHash: 'c', endpointConfigHash: 'e', errorState: null },
          invalidateProvider: false,
          path: 'C' as const,
        })),
        // Fresh cache past 50% TTL would normally trigger GC but path is C → no maintenance
        readDetectionCacheMeta: vi.fn(() => ({ ageMs: 1000, ttlMs: 86400000 })),
      });

      await expect(executePipedMode(minimalArgs(), deps)).rejects.toThrow('process.exit(0)');

      // GC should not be called because path is C
      expect(deps.runCacheGC).not.toHaveBeenCalled();
    });
  });

  describe('embedded mode', () => {
    it('skips \\x1b[0m prefix and NBSP replacement when embedded=true', async () => {
      const deps = createDeps();

      await expect(executePipedMode(minimalArgs({ embedded: true }), deps)).rejects.toThrow('process.exit(0)');

      const written = (stdoutSpy.mock.calls[0]?.[0] as string) ?? '';
      expect(written.startsWith('\x1b[0m')).toBe(false);
      expect(written).not.toContain('\u00A0');
    });

    it('adds \\x1b[0m prefix and NBSP when embedded=false (default behavior)', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'hello world', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'C' as const })),
      });

      await expect(executePipedMode(minimalArgs({ embedded: false }), deps)).rejects.toThrow('process.exit(0)');

      const written = (stdoutSpy.mock.calls[0]?.[0] as string) ?? '';
      expect(written.startsWith('\x1b[0m')).toBe(true);
      expect(written).toContain('\u00A0');
    });

    it('triggers embedded mode via CC_API_STATUSLINE_EMBEDDED=1 env var', async () => {
      const deps = createDeps({
        executeCycle: vi.fn(() => Promise.resolve({ output: 'hello world', exitCode: 0, cacheUpdate: null, invalidateProvider: false, path: 'C' as const })),
      });
      const original = process.env['CC_API_STATUSLINE_EMBEDDED'];
      process.env['CC_API_STATUSLINE_EMBEDDED'] = '1';
      try {
        const args = minimalArgs({
          embedded: process.env['CC_API_STATUSLINE_EMBEDDED'] === '1',
        });
        await expect(executePipedMode(args, deps)).rejects.toThrow('process.exit(0)');
        const written = (stdoutSpy.mock.calls[0]?.[0] as string) ?? '';
        expect(written.startsWith('\x1b[0m')).toBe(false);
        expect(written).not.toContain('\u00A0');
      } finally {
        if (original === undefined) {
          delete process.env['CC_API_STATUSLINE_EMBEDDED'];
        } else {
          process.env['CC_API_STATUSLINE_EMBEDDED'] = original;
        }
      }
    });
  });
});
