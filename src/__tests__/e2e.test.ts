/**
 * End-to-end tests - smoke tests + cache path verification
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import type { CacheEntry, NormalizedUsage } from '../types/index.js';
import { CACHE_VERSION } from '../types/index.js';
import { shortHash } from '../services/hash.js';
import { stripAnsi } from '../renderer/colors.js';

// Test directory
const testDir = join(tmpdir(), `cc-api-e2e-test-${Date.now()}`);
const cacheDir = join(testDir, 'cache');
const configDir = join(testDir, 'config');

beforeAll(() => {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function baseEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    USERPROFILE: process.env['USERPROFILE'],
    TMPDIR: process.env['TMPDIR'],
    TMP: process.env['TMP'],
    TEMP: process.env['TEMP'],
    CLAUDE_CONFIG_DIR: configDir,
    ...overrides,
  };
}

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = baseEnv({})
): { stdout: string; status: number; elapsedMs: number } {
  const start = Date.now();

  try {
    const stdout = execFileSync('node', ['./dist/cc-api-statusline.js', ...args], {
      env,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return {
      stdout,
      status: 0,
      elapsedMs: Date.now() - start,
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error && 'status' in error) {
      return {
        stdout: String((error as { stdout: unknown }).stdout),
        status: Number((error as { status: unknown }).status),
        elapsedMs: Date.now() - start,
      };
    }
    throw error;
  }
}

describe('E2E - CLI Smoke Tests', () => {
  test('CLI runs with --help flag', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('cc-api-statusline');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Options:');
  });

  test('CLI runs with --version flag', () => {
    const result = runCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0.1.0');
  });

  test('CLI handles missing env vars gracefully', () => {
    const result = runCli(['--once'], baseEnv({}));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('⚠');
  });
});

describe('E2E - Cache Paths', () => {
  test('uses cached renderedLine fast path when config hash matches', () => {
    const testBaseUrl = 'https://cached-fast-path.example.com';
    const testToken = 'fast-path-token';
    const testTokenHash = shortHash(testToken, 12);
    const configPath = join(configDir, 'fast-path-config.json');
    writeFileSync(configPath, '{}');

    const mockData: NormalizedUsage = {
      provider: 'sub2api',
      billingMode: 'subscription',
      planName: 'Fast Path',
      fetchedAt: new Date().toISOString(),
      resetSemantics: 'end-of-day',
      daily: null,
      weekly: null,
      monthly: null,
      balance: null,
      resetsAt: null,
      tokenStats: null,
      rateLimit: null,
    };

    const renderedLine = 'CACHE_FAST_PATH_SENTINEL';

    const cacheEntry: CacheEntry = {
      version: CACHE_VERSION,
      baseUrl: testBaseUrl,
      tokenHash: testTokenHash,
      provider: 'sub2api',
      fetchedAt: mockData.fetchedAt,
      ttlSeconds: 300,
      data: mockData,
      renderedLine,
      configHash: shortHash('{}', 12),
      errorState: null,
    };

    const cachePath = join(cacheDir, `cache-${shortHash(testBaseUrl, 12)}.json`);
    writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));

    const result = runCli(['--once', '--config', configPath], {
      ...baseEnv({}),
      ANTHROPIC_BASE_URL: testBaseUrl,
      ANTHROPIC_AUTH_TOKEN: testToken,
      CC_API_STATUSLINE_CACHE_DIR: cacheDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(renderedLine);
    expect(result.elapsedMs).toBeLessThan(600);
  });

  test('re-renders from cached data when renderedLine is stale (config hash mismatch)', () => {
    const testBaseUrl = 'https://cached-rerender.example.com';
    const testToken = 'rerender-token';
    const testTokenHash = shortHash(testToken, 12);
    const configPath = join(configDir, 'rerender-config.json');
    writeFileSync(configPath, '{}');

    const mockData: NormalizedUsage = {
      provider: 'sub2api',
      billingMode: 'subscription',
      planName: 'Re-render',
      fetchedAt: new Date().toISOString(),
      resetSemantics: 'end-of-day',
      daily: null,
      weekly: {
        used: 50,
        limit: 200,
        remaining: 150,
        resetsAt: new Date(Date.now() + 86400000).toISOString(),
      },
      monthly: null,
      balance: null,
      resetsAt: new Date(Date.now() + 86400000).toISOString(),
      tokenStats: null,
      rateLimit: null,
    };

    const staleRenderedLine = 'STALE_RENDERED_LINE_SENTINEL';

    const cacheEntry: CacheEntry = {
      version: CACHE_VERSION,
      baseUrl: testBaseUrl,
      tokenHash: testTokenHash,
      provider: 'sub2api',
      fetchedAt: mockData.fetchedAt,
      ttlSeconds: 300,
      data: mockData,
      renderedLine: staleRenderedLine,
      configHash: 'mismatch-hash',
      errorState: null,
    };

    const cachePath = join(cacheDir, `cache-${shortHash(testBaseUrl, 12)}.json`);
    writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));

    const result = runCli(['--once', '--config', configPath], {
      ...baseEnv({}),
      ANTHROPIC_BASE_URL: testBaseUrl,
      ANTHROPIC_AUTH_TOKEN: testToken,
      CC_API_STATUSLINE_CACHE_DIR: cacheDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stdout).not.toBe(staleRenderedLine);
    expect(stripAnsi(result.stdout)).toContain('Weekly');
  });
});

describe('E2E - Performance Verification', () => {
  test('cached execution completes within reasonable time', () => {
    const testBaseUrl = 'https://perf-test.example.com';
    const testToken = 'perf-token';
    const testTokenHash = shortHash(testToken, 12);
    const configPath = join(configDir, 'perf-config.json');
    writeFileSync(configPath, '{}');

    const mockData: NormalizedUsage = {
      provider: 'sub2api',
      billingMode: 'subscription',
      planName: 'Perf Test',
      fetchedAt: new Date().toISOString(),
      resetSemantics: 'end-of-day',
      daily: {
        used: 50,
        limit: 100,
        remaining: 50,
        resetsAt: new Date(Date.now() + 3600000).toISOString(),
      },
      weekly: null,
      monthly: null,
      balance: null,
      resetsAt: new Date(Date.now() + 3600000).toISOString(),
      tokenStats: null,
      rateLimit: null,
    };

    const cacheEntry: CacheEntry = {
      version: CACHE_VERSION,
      baseUrl: testBaseUrl,
      tokenHash: testTokenHash,
      provider: 'sub2api',
      fetchedAt: mockData.fetchedAt,
      ttlSeconds: 300,
      data: mockData,
      renderedLine: 'Daily ━━━━──── 50%',
      configHash: shortHash('{}', 12),
      errorState: null,
    };

    const cachePath = join(cacheDir, `cache-${shortHash(testBaseUrl, 12)}.json`);
    writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));

    const result = runCli(['--once', '--config', configPath], {
      ...baseEnv({}),
      ANTHROPIC_BASE_URL: testBaseUrl,
      ANTHROPIC_AUTH_TOKEN: testToken,
      CC_API_STATUSLINE_CACHE_DIR: cacheDir,
    });

    console.log(`Cached execution time: ${result.elapsedMs}ms`);
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeLessThan(1000);
  });
});
