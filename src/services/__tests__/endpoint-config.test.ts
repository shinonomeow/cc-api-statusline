import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getEndpointConfigDir,
  loadEndpointConfigs,
  loadEndpointConfigFile,
  validateEndpointConfig,
  computeEndpointConfigHash,
  getBuiltInEndpointConfigs,
} from '../endpoint-config.js';

let testDir: string;
const ORIG_ENV = process.env['CC_API_STATUSLINE_CONFIG_DIR'];

beforeEach(() => {
  testDir = join(tmpdir(), `endpoint-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  delete process.env['CC_API_STATUSLINE_CONFIG_DIR'];
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  if (ORIG_ENV !== undefined) {
    process.env['CC_API_STATUSLINE_CONFIG_DIR'] = ORIG_ENV;
  } else {
    delete process.env['CC_API_STATUSLINE_CONFIG_DIR'];
  }
});

// ---------------------------------------------------------------------------
// getEndpointConfigDir
// ---------------------------------------------------------------------------

describe('getEndpointConfigDir', () => {
  it('returns api-config/ under custom root when arg is provided', () => {
    const result = getEndpointConfigDir(testDir);
    expect(result).toBe(join(testDir, 'api-config'));
  });

  it('uses CC_API_STATUSLINE_CONFIG_DIR env var when no arg is provided', () => {
    process.env['CC_API_STATUSLINE_CONFIG_DIR'] = testDir;
    const result = getEndpointConfigDir();
    expect(result).toBe(join(testDir, 'api-config'));
  });

  it('custom arg takes priority over env var', () => {
    process.env['CC_API_STATUSLINE_CONFIG_DIR'] = '/env-dir';
    const result = getEndpointConfigDir(testDir);
    expect(result).toBe(join(testDir, 'api-config'));
  });

  it('returns default path containing .claude when no arg or env var', () => {
    const result = getEndpointConfigDir();
    expect(result).toContain('.claude');
    expect(result).toContain('cc-api-statusline');
    expect(result).toContain('api-config');
  });
});

// ---------------------------------------------------------------------------
// loadEndpointConfigs
// ---------------------------------------------------------------------------

const validConfig = {
  provider: 'my-provider',
  endpoint: { path: '/v1/usage', method: 'GET' },
  auth: { type: 'bearer-header' },
  responseMapping: { 'daily.used': '$.daily.used' },
};

describe('loadEndpointConfigs', () => {
  it('returns built-in configs when directory does not exist', () => {
    const result = loadEndpointConfigs(join(testDir, 'nonexistent'));
    const builtin = getBuiltInEndpointConfigs();
    expect(Object.keys(result).sort()).toEqual(Object.keys(builtin).sort());
  });

  it('returns built-in configs when directory is empty', () => {
    mkdirSync(join(testDir, 'api-config'), { recursive: true });
    const result = loadEndpointConfigs(testDir);
    const builtin = getBuiltInEndpointConfigs();
    expect(Object.keys(result).sort()).toEqual(Object.keys(builtin).sort());
  });

  it('loads a valid JSON file and registers it by provider key', () => {
    const apiDir = join(testDir, 'api-config');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'my-provider.json'), JSON.stringify(validConfig));
    const result = loadEndpointConfigs(testDir);
    expect(result['my-provider']).toBeDefined();
    expect(result['my-provider']?.provider).toBe('my-provider');
  });

  it('silently skips invalid files and still loads valid ones', () => {
    const apiDir = join(testDir, 'api-config');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'bad.json'), 'not valid json');
    writeFileSync(join(apiDir, 'good.json'), JSON.stringify(validConfig));
    const result = loadEndpointConfigs(testDir);
    expect(result['my-provider']).toBeDefined();
    expect(result['bad']).toBeUndefined();
  });

  it('falls back to built-in when all files are invalid', () => {
    const apiDir = join(testDir, 'api-config');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'bad.json'), 'not valid json');
    const result = loadEndpointConfigs(testDir);
    const builtin = getBuiltInEndpointConfigs();
    expect(Object.keys(result).sort()).toEqual(Object.keys(builtin).sort());
  });

  it('loads multiple valid files', () => {
    const apiDir = join(testDir, 'api-config');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'prov1.json'), JSON.stringify({ ...validConfig, provider: 'prov1' }));
    writeFileSync(join(apiDir, 'prov2.json'), JSON.stringify({ ...validConfig, provider: 'prov2' }));
    const result = loadEndpointConfigs(testDir);
    expect(result['prov1']).toBeDefined();
    expect(result['prov2']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// loadEndpointConfigFile
// ---------------------------------------------------------------------------

describe('loadEndpointConfigFile', () => {
  it('parses and returns a valid config file', () => {
    const filePath = join(testDir, 'valid.json');
    writeFileSync(filePath, JSON.stringify(validConfig));
    const result = loadEndpointConfigFile(filePath);
    expect(result.provider).toBe('my-provider');
  });

  it('throws on invalid JSON', () => {
    const filePath = join(testDir, 'bad.json');
    writeFileSync(filePath, 'this is not json');
    expect(() => loadEndpointConfigFile(filePath)).toThrow();
  });

  it('throws when required provider field is missing', () => {
    const filePath = join(testDir, 'noprovider.json');
    const { provider: _p, ...withoutProvider } = validConfig;
    writeFileSync(filePath, JSON.stringify(withoutProvider));
    expect(() => loadEndpointConfigFile(filePath)).toThrow(/provider/i);
  });
});

// ---------------------------------------------------------------------------
// validateEndpointConfig
// ---------------------------------------------------------------------------

describe('validateEndpointConfig', () => {
  it('does not throw for a valid config', () => {
    expect(() => { validateEndpointConfig(validConfig, 'test.json'); }).not.toThrow();
  });

  it.each([
    ['missing provider', { ...validConfig, provider: '' }, /provider/i],
    ['missing endpoint', { ...validConfig, endpoint: null }, /endpoint/i],
    ['invalid endpoint.method', { ...validConfig, endpoint: { path: '/v1/usage', method: 'DELETE' } }, /method/i],
    ['invalid auth.type', { ...validConfig, auth: { type: 'magic-wand' } }, /auth\.type/i],
    ['missing responseMapping', { ...validConfig, responseMapping: null }, /responseMapping/i],
    ['responseMapping value not string', { ...validConfig, responseMapping: { key: 123 } }, /responseMapping/i],
  ])('throws for %s', (_label, data, pattern) => {
    expect(() => { validateEndpointConfig(data, 'test.json'); }).toThrow(pattern);
  });
});

// ---------------------------------------------------------------------------
// computeEndpointConfigHash
// ---------------------------------------------------------------------------

describe('computeEndpointConfigHash', () => {
  it('returns a 12-character hex string', () => {
    const hash = computeEndpointConfigHash(testDir);
    expect(hash).toHaveLength(12);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same directory contents', () => {
    const apiDir = join(testDir, 'api-config');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'p.json'), JSON.stringify(validConfig));
    const h1 = computeEndpointConfigHash(testDir);
    const h2 = computeEndpointConfigHash(testDir);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different directory contents', () => {
    const dir1 = join(testDir, 'set1');
    const dir2 = join(testDir, 'set2');
    mkdirSync(join(dir1, 'api-config'), { recursive: true });
    mkdirSync(join(dir2, 'api-config'), { recursive: true });
    writeFileSync(join(dir1, 'api-config', 'p.json'), JSON.stringify(validConfig));
    writeFileSync(join(dir2, 'api-config', 'p.json'), JSON.stringify({ ...validConfig, provider: 'other' }));
    const h1 = computeEndpointConfigHash(dir1);
    const h2 = computeEndpointConfigHash(dir2);
    expect(h1).not.toBe(h2);
  });

  it('returns built-in hash when directory does not exist', () => {
    const hash = computeEndpointConfigHash(join(testDir, 'nonexistent'));
    expect(hash).toHaveLength(12);
  });

  it('empty directory yields same hash as missing directory (both use built-ins)', () => {
    const emptyDir = join(testDir, 'empty');
    mkdirSync(join(emptyDir, 'api-config'), { recursive: true });
    const hashMissing = computeEndpointConfigHash(join(testDir, 'nonexistent'));
    const hashEmpty = computeEndpointConfigHash(emptyDir);
    expect(hashEmpty).toBe(hashMissing);
  });
});

// ---------------------------------------------------------------------------
// getBuiltInEndpointConfigs
// ---------------------------------------------------------------------------

describe('getBuiltInEndpointConfigs', () => {
  it('includes sub2api config', () => {
    const configs = getBuiltInEndpointConfigs();
    expect(configs['sub2api']).toBeDefined();
  });

  it('includes claude-relay-service config', () => {
    const configs = getBuiltInEndpointConfigs();
    expect(configs['claude-relay-service']).toBeDefined();
  });

  it('sub2api has bearer-header auth', () => {
    const configs = getBuiltInEndpointConfigs();
    expect(configs['sub2api']?.auth.type).toBe('bearer-header');
  });

  it('claude-relay-service has body-key auth', () => {
    const configs = getBuiltInEndpointConfigs();
    expect(configs['claude-relay-service']?.auth.type).toBe('body-key');
  });

  it('returns a new object each call (no shared reference)', () => {
    const a = getBuiltInEndpointConfigs();
    const b = getBuiltInEndpointConfigs();
    expect(a).not.toBe(b);
  });
});
