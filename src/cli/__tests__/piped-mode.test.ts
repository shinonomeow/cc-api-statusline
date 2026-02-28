/**
 * Piped Mode Execution Tests
 *
 * Tests the error-handling harness around buildExecutionContext.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted before any imports)
// ---------------------------------------------------------------------------

vi.mock('../../services/env.js', () => ({
  readCurrentEnv: vi.fn(() => ({
    baseUrl: 'https://api.example.com',
    authToken: 'test-token',
    tokenHash: 'abc123',
    providerOverride: null,
    pollIntervalOverride: null,
  })),
  validateRequiredEnv: vi.fn(() => null),
}));

vi.mock('../../services/config-defaults.js', () => ({
  needsConfigInit: vi.fn(() => false),
  writeDefaultConfigs: vi.fn(),
}));

vi.mock('../../services/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
  getConfigPath: vi.fn(() => '/tmp/config.json'),
}));

vi.mock('../../services/cache.js', () => ({
  readCache: vi.fn(() => null),
  writeCache: vi.fn(),
  computeConfigHash: vi.fn(() => 'config-hash'),
  getCacheDir: vi.fn(() => '/tmp/cache'),
}));

vi.mock('../../services/endpoint-config.js', () => ({
  loadEndpointConfigs: vi.fn(() => ({})),
  computeEndpointConfigHash: vi.fn(() => 'endpoint-hash'),
}));

vi.mock('../../services/endpoint-lock.js', () => ({
  readEndpointLock: vi.fn(() => ({ hash: 'endpoint-hash', lockedAt: '2026-01-01T00:00:00Z' })),
  writeEndpointLock: vi.fn(),
}));

vi.mock('../../providers/index.js', () => ({
  resolveProvider: vi.fn(async () => 'anthropic'),
  getProvider: vi.fn(() => ({ fetch: vi.fn(async () => ({ output: 'test', exitCode: 0, cacheUpdate: null })) })),
}));

vi.mock('../../core/index.js', () => ({
  executeCycle: vi.fn(async () => ({ output: 'test output', exitCode: 0, cacheUpdate: null })),
}));

vi.mock('../../services/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../services/cache-gc.js', () => ({
  runCacheGC: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { executePipedMode } from '../piped-mode.js';
import type { ParsedArgs } from '../args.js';
import * as configDefaults from '../../services/config-defaults.js';
import * as logger from '../../services/logger.js';

function minimalArgs(overrides?: Partial<ParsedArgs>): ParsedArgs {
  return {
    help: false,
    version: false,
    once: false,
    install: false,
    uninstall: false,
    applyConfig: false,
    force: false,
    ...overrides,
  };
}

describe('executePipedMode', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Prevent process.exit from terminating the test runner
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((_chunk: unknown) => true);

    // Default: stdin is treated as piped (not TTY)
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildExecutionContext error handling', () => {
    it('exits 0 with network-error output when writeDefaultConfigs throws', async () => {
      (configDefaults.needsConfigInit as MockedFunction<typeof configDefaults.needsConfigInit>).mockReturnValue(true);
      (configDefaults.writeDefaultConfigs as MockedFunction<typeof configDefaults.writeDefaultConfigs>).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(executePipedMode(minimalArgs())).rejects.toThrow('process.exit(0)');

      // Should have written error output (not blank)
      expect(stdoutSpy).toHaveBeenCalled();
      const written = (stdoutSpy.mock.calls[0]?.[0] as string) ?? '';
      expect(written.length).toBeGreaterThan(0);

      // Must exit 0 — not 1
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('logs the error before exiting', async () => {
      (configDefaults.needsConfigInit as MockedFunction<typeof configDefaults.needsConfigInit>).mockReturnValue(true);
      (configDefaults.writeDefaultConfigs as MockedFunction<typeof configDefaults.writeDefaultConfigs>).mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      await expect(executePipedMode(minimalArgs())).rejects.toThrow('process.exit(0)');

      expect((logger.logger as { error: MockedFunction<() => void> }).error).toHaveBeenCalledWith(
        'Failed to build execution context',
        expect.objectContaining({ error: expect.stringContaining('ENOSPC') })
      );
    });

    it('does not propagate the thrown error to the caller', async () => {
      (configDefaults.needsConfigInit as MockedFunction<typeof configDefaults.needsConfigInit>).mockReturnValue(true);
      (configDefaults.writeDefaultConfigs as MockedFunction<typeof configDefaults.writeDefaultConfigs>).mockImplementation(() => {
        throw new Error('Unexpected I/O error');
      });

      // The only rejection should be our mocked process.exit, not the original error
      const rejection = await executePipedMode(minimalArgs()).catch((e: Error) => e);
      expect(rejection.message).toContain('process.exit(0)');
      expect(rejection.message).not.toContain('Unexpected I/O error');
    });
  });

  describe('happy path', () => {
    it('exits 0 on successful execution', async () => {
      await expect(executePipedMode(minimalArgs())).rejects.toThrow('process.exit(0)');

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });
});
