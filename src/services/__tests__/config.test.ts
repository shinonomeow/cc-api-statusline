import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getConfigDir,
  ensureConfigDir,
  readRawConfigBytes,
} from '../config.js';
import { DEFAULT_CONFIG } from '../../types/index.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config service', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `cc-api-statusline-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      // Remove all files in directory
      const files = readdirSync(testDir);
      for (const file of files) {
        const filePath = join(testDir, file);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
      rmdirSync(testDir);
    }
  });

  describe('getConfigPath', () => {
    it('should return custom path if provided', () => {
      const customPath = '/custom/config.json';
      const path = getConfigPath(customPath);

      expect(path).toBe(customPath);
    });

    it('should return default path if not provided', () => {
      const path = getConfigPath();

      expect(path).toContain('.claude');
      expect(path).toContain('cc-api-statusline');
      expect(path).toContain('config.json');
    });
  });

  describe('ensureConfigDir', () => {
    it('should create config directory if it does not exist', () => {
      const dir = getConfigDir();

      // Directory should exist (it's in ~/.claude which should exist)
      // This test mainly verifies it doesn't throw
      expect(() => {
        ensureConfigDir();
      }).not.toThrow();

      expect(existsSync(dir)).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('should return DEFAULT_CONFIG when file does not exist', () => {
      const nonExistentPath = join(testDir, 'nonexistent.json');
      const config = loadConfig(nonExistentPath);

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should load and merge with defaults', () => {
      const configPath = join(testDir, 'config.json');
      const userConfig = {
        display: {
          layout: 'percent-first' as const,
          maxWidth: 90,
        },
        components: {
          daily: true,
          tokens: true,
        },
      };

      writeFileSync(configPath, JSON.stringify(userConfig), 'utf-8');

      const config = loadConfig(configPath);

      // Should merge with defaults
      expect(config.display.layout).toBe('percent-first');
      expect(config.display.maxWidth).toBe(90);
      // Defaults should be preserved
      expect(config.display.displayMode).toBe(DEFAULT_CONFIG.display.displayMode);
      expect(config.display.barSize).toBe(DEFAULT_CONFIG.display.barSize);
    });

    it('should clamp maxWidth to 20-100 range', () => {
      const configPath = join(testDir, 'config.json');

      // Test too low
      writeFileSync(
        configPath,
        JSON.stringify({ display: { maxWidth: 10 } }),
        'utf-8'
      );
      let config = loadConfig(configPath);
      expect(config.display.maxWidth).toBe(20);

      // Test too high
      writeFileSync(
        configPath,
        JSON.stringify({ display: { maxWidth: 150 } }),
        'utf-8'
      );
      config = loadConfig(configPath);
      expect(config.display.maxWidth).toBe(100);
    });

    it('should clamp pollIntervalSeconds to minimum 5', () => {
      const configPath = join(testDir, 'config.json');

      writeFileSync(
        configPath,
        JSON.stringify({ pollIntervalSeconds: 2 }),
        'utf-8'
      );

      const config = loadConfig(configPath);

      expect(config.pollIntervalSeconds).toBe(5);
    });

    it('should handle invalid JSON gracefully', () => {
      const configPath = join(testDir, 'config.json');

      writeFileSync(configPath, 'invalid json {{{', 'utf-8');

      const config = loadConfig(configPath);

      // Should return DEFAULT_CONFIG on parse error
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should deep merge nested objects', () => {
      const configPath = join(testDir, 'config.json');
      const userConfig = {
        display: {
          displayMode: 'compact' as const,
        },
        colors: {
          custom: {
            low: 'blue',
            medium: 'purple',
            high: 'red',
            lowThreshold: 40,
            highThreshold: 75,
          },
        },
      };

      writeFileSync(configPath, JSON.stringify(userConfig), 'utf-8');

      const config = loadConfig(configPath);

      // User config should be merged
      expect(config.display.displayMode).toBe('compact');
      expect(config.colors?.['custom']).toEqual(userConfig.colors.custom);

      // Defaults should be preserved
      expect(config.colors?.['auto']).toEqual(DEFAULT_CONFIG.colors?.['auto']);
      expect(config.display.divider).toEqual(DEFAULT_CONFIG.display.divider);
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', () => {
      const configPath = join(testDir, 'config.json');
      const config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          layout: 'percent-first' as const,
        },
      };

      saveConfig(config, configPath);

      expect(existsSync(configPath)).toBe(true);

      // Read back and verify
      const loaded = loadConfig(configPath);
      expect(loaded.display.layout).toBe('percent-first');
    });

    it('should use atomic write (no .tmp file left behind)', () => {
      const configPath = join(testDir, 'config.json');
      const tmpPath = `${configPath}.tmp`;

      saveConfig(DEFAULT_CONFIG, configPath);

      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(tmpPath)).toBe(false);
    });

    it('should round-trip config correctly', () => {
      const configPath = join(testDir, 'config.json');
      const originalConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          layout: 'percent-first' as const,
          maxWidth: 75,
        },
        pollIntervalSeconds: 45,
      };

      saveConfig(originalConfig, configPath);
      const loaded = loadConfig(configPath);

      expect(loaded.display.layout).toBe(originalConfig.display.layout);
      expect(loaded.display.maxWidth).toBe(originalConfig.display.maxWidth);
      expect(loaded.pollIntervalSeconds).toBe(originalConfig.pollIntervalSeconds);
    });
  });

  describe('readRawConfigBytes', () => {
    it('should return null when file does not exist', () => {
      const nonExistentPath = join(testDir, 'nonexistent.json');
      const bytes = readRawConfigBytes(nonExistentPath);

      expect(bytes).toBeNull();
    });

    it('should return raw file bytes', () => {
      const configPath = join(testDir, 'config.json');
      const content = '{"test": "data"}';

      writeFileSync(configPath, content, 'utf-8');

      const bytes = readRawConfigBytes(configPath);

      expect(bytes).toBeTruthy();
      expect(bytes?.toString('utf-8')).toBe(content);
    });

    it('should return exact bytes without parsing', () => {
      const configPath = join(testDir, 'config.json');
      // Write invalid JSON - readRawConfigBytes should still work
      const content = 'not valid json {{{';

      writeFileSync(configPath, content, 'utf-8');

      const bytes = readRawConfigBytes(configPath);

      expect(bytes).toBeTruthy();
      expect(bytes?.toString('utf-8')).toBe(content);
    });
  });
});
