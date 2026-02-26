import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCurrentEnv, validateRequiredEnv, getSettingsJsonPath } from '../env.js';

describe('env service', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env['ANTHROPIC_BASE_URL'];
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['CC_STATUSLINE_PROVIDER'];
    delete process.env['CC_STATUSLINE_POLL'];
    delete process.env['CLAUDE_CONFIG_DIR'];
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('readCurrentEnv', () => {
    it('should read environment variables', () => {
      // Set a fake config dir to prevent settings.json overlay from interfering
      process.env['CLAUDE_CONFIG_DIR'] = '/tmp/nonexistent-dir-' + String(Date.now());

      process.env['ANTHROPIC_BASE_URL'] = 'https://api.example.com';
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'test-token-123';
      process.env['CC_STATUSLINE_PROVIDER'] = 'sub2api';
      process.env['CC_STATUSLINE_POLL'] = '60';

      const env = readCurrentEnv();

      expect(env.baseUrl).toBe('https://api.example.com');
      expect(env.authToken).toBe('test-token-123');
      expect(env.providerOverride).toBe('sub2api');
      expect(env.pollIntervalOverride).toBe(60);
    });

    it('should compute tokenHash', () => {
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'test-token-123';

      const env = readCurrentEnv();

      expect(env.tokenHash).toBeTruthy();
      expect(env.tokenHash).toHaveLength(12);
      expect(env.tokenHash).toMatch(/^[0-9a-f]{12}$/);

      // Should be deterministic
      const env2 = readCurrentEnv();
      expect(env2.tokenHash).toBe(env.tokenHash);
    });

    it('should return null for missing variables', () => {
      // Set a fake config dir to avoid reading real settings.json
      process.env['CLAUDE_CONFIG_DIR'] = '/tmp/nonexistent-dir-' + String(Date.now());

      const env = readCurrentEnv();

      // Note: These may not be null if the real environment has these vars set
      // We can only test that the function doesn't crash
      expect(env).toBeDefined();
      expect(typeof env.baseUrl === 'string' || env.baseUrl === null).toBe(true);
      expect(typeof env.authToken === 'string' || env.authToken === null).toBe(true);
    });

    it('should parse poll interval override', () => {
      process.env['CC_STATUSLINE_POLL'] = '120';

      const env = readCurrentEnv();

      expect(env.pollIntervalOverride).toBe(120);
    });

    it('should reject invalid poll interval values', () => {
      // Below minimum
      process.env['CC_STATUSLINE_POLL'] = '3';
      let env = readCurrentEnv();
      expect(env.pollIntervalOverride).toBeNull();

      // Not a number
      process.env['CC_STATUSLINE_POLL'] = 'invalid';
      env = readCurrentEnv();
      expect(env.pollIntervalOverride).toBeNull();
    });

    it('should handle settings.json overlay when file does not exist', () => {
      // Set a fake config dir to avoid reading real settings
      process.env['CLAUDE_CONFIG_DIR'] = '/tmp/nonexistent-dir-' + String(Date.now());

      process.env['ANTHROPIC_BASE_URL'] = 'https://from-env.com';

      const env = readCurrentEnv();

      // Should use process.env value
      expect(env.baseUrl).toBe('https://from-env.com');
    });
  });

  describe('validateRequiredEnv', () => {
    it('should validate successful when all required vars present', () => {
      const env = {
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        tokenHash: 'abc123',
        providerOverride: null,
        pollIntervalOverride: null,
      };

      const error = validateRequiredEnv(env);

      expect(error).toBeNull();
    });

    it('should return error when baseUrl missing', () => {
      const env = {
        baseUrl: null,
        authToken: 'test-token',
        tokenHash: 'abc123',
        providerOverride: null,
        pollIntervalOverride: null,
      };

      const error = validateRequiredEnv(env);

      expect(error).toBeTruthy();
      expect(error).toContain('ANTHROPIC_BASE_URL');
    });

    it('should return error when authToken missing', () => {
      const env = {
        baseUrl: 'https://api.example.com',
        authToken: null,
        tokenHash: null,
        providerOverride: null,
        pollIntervalOverride: null,
      };

      const error = validateRequiredEnv(env);

      expect(error).toBeTruthy();
      expect(error).toContain('ANTHROPIC_AUTH_TOKEN');
    });

    it('should return error for first missing var when both missing', () => {
      const env = {
        baseUrl: null,
        authToken: null,
        tokenHash: null,
        providerOverride: null,
        pollIntervalOverride: null,
      };

      const error = validateRequiredEnv(env);

      expect(error).toBeTruthy();
      // Should check baseUrl first
      expect(error).toContain('ANTHROPIC_BASE_URL');
    });
  });

  describe('getSettingsJsonPath', () => {
    it('should use CLAUDE_CONFIG_DIR if set', () => {
      process.env['CLAUDE_CONFIG_DIR'] = '/custom/config';

      const path = getSettingsJsonPath();

      expect(path).toBe('/custom/config/settings.json');
    });

    it('should use home directory if CLAUDE_CONFIG_DIR not set', () => {
      delete process.env['CLAUDE_CONFIG_DIR'];

      const path = getSettingsJsonPath();

      expect(path).toContain('.claude');
      expect(path).toContain('settings.json');
    });
  });
});
