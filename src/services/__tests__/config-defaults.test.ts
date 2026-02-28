import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getDefaultStyleConfig,
  getDefaultSub2apiConfig,
  getDefaultCrsConfig,
  writeDefaultConfigs,
  needsConfigInit,
} from '../config-defaults.js';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `config-defaults-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getDefaultStyleConfig
// ---------------------------------------------------------------------------

describe('getDefaultStyleConfig', () => {
  it('returns an object with display config', () => {
    const config = getDefaultStyleConfig();
    expect(config.display).toBeDefined();
  });

  it('returns an object with components config', () => {
    const config = getDefaultStyleConfig();
    expect(config.components).toBeDefined();
  });

  it('has a numeric pollIntervalSeconds', () => {
    const config = getDefaultStyleConfig();
    expect(typeof config.pollIntervalSeconds).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// getDefaultSub2apiConfig
// ---------------------------------------------------------------------------

describe('getDefaultSub2apiConfig', () => {
  it('returns an EndpointConfig with provider = sub2api', () => {
    const config = getDefaultSub2apiConfig();
    expect(config.provider).toBe('sub2api');
  });

  it('uses bearer-header auth', () => {
    const config = getDefaultSub2apiConfig();
    expect(config.auth.type).toBe('bearer-header');
  });

  it('has an endpoint path', () => {
    const config = getDefaultSub2apiConfig();
    expect(config.endpoint.path).toBeTruthy();
    expect(config.endpoint.path.startsWith('/')).toBe(true);
  });

  it('has a responseMapping object', () => {
    const config = getDefaultSub2apiConfig();
    expect(typeof config.responseMapping).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// getDefaultCrsConfig
// ---------------------------------------------------------------------------

describe('getDefaultCrsConfig', () => {
  it('returns an EndpointConfig with provider = claude-relay-service', () => {
    const config = getDefaultCrsConfig();
    expect(config.provider).toBe('claude-relay-service');
  });

  it('uses body-key auth', () => {
    const config = getDefaultCrsConfig();
    expect(config.auth.type).toBe('body-key');
  });

  it('has an endpoint path', () => {
    const config = getDefaultCrsConfig();
    expect(config.endpoint.path).toBeTruthy();
    expect(config.endpoint.path.startsWith('/')).toBe(true);
  });

  it('has a responseMapping object', () => {
    const config = getDefaultCrsConfig();
    expect(typeof config.responseMapping).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// writeDefaultConfigs
// ---------------------------------------------------------------------------

describe('writeDefaultConfigs', () => {
  it('creates config.json', () => {
    writeDefaultConfigs(testDir);
    expect(existsSync(join(testDir, 'config.json'))).toBe(true);
  });

  it('creates api-config/sub2api.json', () => {
    writeDefaultConfigs(testDir);
    expect(existsSync(join(testDir, 'api-config', 'sub2api.json'))).toBe(true);
  });

  it('creates api-config/crs.json', () => {
    writeDefaultConfigs(testDir);
    expect(existsSync(join(testDir, 'api-config', 'crs.json'))).toBe(true);
  });

  it('creates a lock file', () => {
    writeDefaultConfigs(testDir);
    expect(existsSync(join(testDir, '.endpoint-config.lock'))).toBe(true);
  });

  it('config.json contains valid JSON', () => {
    writeDefaultConfigs(testDir);
    const raw = readFileSync(join(testDir, 'config.json'), 'utf-8');
    expect(() => { JSON.parse(raw); }).not.toThrow();
  });

  it('is idempotent — does not overwrite existing config.json', () => {
    const configPath = join(testDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ sentinel: true }));
    writeDefaultConfigs(testDir);
    const content = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    expect(content['sentinel']).toBe(true);
  });

  it('is idempotent — does not overwrite existing sub2api.json', () => {
    mkdirSync(join(testDir, 'api-config'), { recursive: true });
    const sub2apiPath = join(testDir, 'api-config', 'sub2api.json');
    writeFileSync(sub2apiPath, JSON.stringify({ sentinel: true }));
    writeDefaultConfigs(testDir);
    const content = JSON.parse(readFileSync(sub2apiPath, 'utf-8')) as Record<string, unknown>;
    expect(content['sentinel']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// needsConfigInit
// ---------------------------------------------------------------------------

describe('needsConfigInit', () => {
  it('returns true when config.json does not exist', () => {
    mkdirSync(join(testDir, 'api-config'), { recursive: true });
    expect(needsConfigInit(testDir)).toBe(true);
  });

  it('returns true when api-config/ directory does not exist', () => {
    writeFileSync(join(testDir, 'config.json'), '{}');
    expect(needsConfigInit(testDir)).toBe(true);
  });

  it('returns false when both config.json and api-config/ exist', () => {
    writeFileSync(join(testDir, 'config.json'), '{}');
    mkdirSync(join(testDir, 'api-config'), { recursive: true });
    expect(needsConfigInit(testDir)).toBe(false);
  });
});
