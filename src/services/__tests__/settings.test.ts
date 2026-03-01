import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadClaudeSettings,
  saveClaudeSettings,
  getExistingStatusLine,
  isBunxAvailable,
  installStatusLine,
  uninstallStatusLine,
} from '../settings.js';
import { logger } from '../logger.js';
import type { ClaudeSettings } from '../settings.js';

describe('settings service', () => {
  let testDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `cc-api-settings-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Override CLAUDE_CONFIG_DIR for isolated testing
    originalEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = testDir;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv) {
      process.env['CLAUDE_CONFIG_DIR'] = originalEnv;
    } else {
      delete process.env['CLAUDE_CONFIG_DIR'];
    }

    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadClaudeSettings', () => {
    it('should return empty object when settings.json does not exist', () => {
      const settings = loadClaudeSettings();
      expect(settings).toEqual({});
    });

    it('should parse existing settings.json', () => {
      const settingsPath = join(testDir, 'settings.json');
      const mockSettings = {
        statusLine: {
          type: 'command',
          command: 'npx -y cc-api-statusline@latest',
          padding: 0,
        },
        otherKey: 'value',
      };

      writeFileSync(settingsPath, JSON.stringify(mockSettings, null, 2));

      const settings = loadClaudeSettings();
      expect(settings).toEqual(mockSettings);
    });

    it('should return empty object on corrupted JSON', () => {
      const settingsPath = join(testDir, 'settings.json');
      writeFileSync(settingsPath, 'invalid json {{{');

      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      const settings = loadClaudeSettings();
      expect(settings).toEqual({});
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('saveClaudeSettings', () => {
    it('should write settings atomically', () => {
      const settingsPath = join(testDir, 'settings.json');
      const mockSettings: ClaudeSettings = {
        statusLine: {
          type: 'command',
          command: 'bunx -y cc-api-statusline@latest',
          padding: 0,
        },
      };

      saveClaudeSettings(mockSettings);

      expect(existsSync(settingsPath)).toBe(true);
      const content = readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(content) as ClaudeSettings;
      expect(parsed).toEqual(mockSettings);
    });

    it('should create directory if it does not exist', () => {
      // Use nested directory that doesn't exist yet
      const nestedDir = join(testDir, 'nested', 'path');
      process.env['CLAUDE_CONFIG_DIR'] = nestedDir;

      const mockSettings: ClaudeSettings = { key: 'value' };
      saveClaudeSettings(mockSettings);

      const settingsPath = join(nestedDir, 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
    });

    it('should not leave temp files on successful write', () => {
      const settingsPath = join(testDir, 'settings.json');
      const tmpPath = `${settingsPath}.tmp`;
      const mockSettings: ClaudeSettings = { key: 'value' };

      saveClaudeSettings(mockSettings);

      expect(existsSync(settingsPath)).toBe(true);
      expect(existsSync(tmpPath)).toBe(false);
    });
  });

  describe('getExistingStatusLine', () => {
    it('should return null when no settings.json exists', () => {
      const result = getExistingStatusLine();
      expect(result).toBeNull();
    });

    it('should return null when statusLine is not configured', () => {
      const settingsPath = join(testDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ otherKey: 'value' }));

      const result = getExistingStatusLine();
      expect(result).toBeNull();
    });

    it('should return command when statusLine is configured', () => {
      const settingsPath = join(testDir, 'settings.json');
      const mockSettings = {
        statusLine: {
          type: 'command',
          command: 'npx -y cc-api-statusline@latest',
          padding: 0,
        },
      };
      writeFileSync(settingsPath, JSON.stringify(mockSettings));

      const result = getExistingStatusLine();
      expect(result).toBe('npx -y cc-api-statusline@latest');
    });
  });

  describe('isBunxAvailable', () => {
    it('should return boolean based on bunx availability', () => {
      const result = isBunxAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('installStatusLine', () => {
    it('should install statusLine with npx runner', () => {
      const settingsPath = join(testDir, 'settings.json');

      installStatusLine('npx');

      expect(existsSync(settingsPath)).toBe(true);
      const settings = loadClaudeSettings();
      expect(settings.statusLine).toEqual({
        type: 'command',
        command: 'npx -y cc-api-statusline@latest',
        padding: 0,
      });
    });

    it('should install statusLine with bunx runner', () => {
      installStatusLine('bunx');

      const settings = loadClaudeSettings();
      expect(settings.statusLine).toEqual({
        type: 'command',
        command: 'bunx -y cc-api-statusline@latest',
        padding: 0,
      });
    });

    it('should preserve other keys when installing', () => {
      const settingsPath = join(testDir, 'settings.json');
      const existingSettings = {
        otherKey: 'value',
        nestedKey: { foo: 'bar' },
      };
      writeFileSync(settingsPath, JSON.stringify(existingSettings));

      installStatusLine('npx');

      const settings = loadClaudeSettings();
      expect(settings.otherKey).toBe('value');
      expect(settings.nestedKey).toEqual({ foo: 'bar' });
      expect(settings.statusLine).toBeDefined();
    });

    it('should overwrite existing statusLine', () => {
      const settingsPath = join(testDir, 'settings.json');
      const existingSettings = {
        statusLine: {
          type: 'command',
          command: 'old-command',
          padding: 1,
        },
      };
      writeFileSync(settingsPath, JSON.stringify(existingSettings));

      installStatusLine('bunx');

      const settings = loadClaudeSettings();
      expect(settings.statusLine?.command).toBe('bunx -y cc-api-statusline@latest');
    });
  });

  describe('uninstallStatusLine', () => {
    it('should remove statusLine key', () => {
      const settingsPath = join(testDir, 'settings.json');
      const mockSettings = {
        statusLine: {
          type: 'command',
          command: 'npx -y cc-api-statusline@latest',
          padding: 0,
        },
        otherKey: 'value',
      };
      writeFileSync(settingsPath, JSON.stringify(mockSettings));

      uninstallStatusLine();

      const settings = loadClaudeSettings();
      expect(settings.statusLine).toBeUndefined();
      expect(settings.otherKey).toBe('value');
    });

    it('should handle case when statusLine does not exist', () => {
      const settingsPath = join(testDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ otherKey: 'value' }));

      // Should not throw
      uninstallStatusLine();

      const settings = loadClaudeSettings();
      expect(settings.otherKey).toBe('value');
    });

    it('should handle case when settings.json does not exist', () => {
      // Should not throw
      uninstallStatusLine();

      // Should create empty settings.json (since we're deleting a key that doesn't exist)
      const settingsPath = join(testDir, 'settings.json');
      expect(existsSync(settingsPath)).toBe(false); // No file created if nothing to delete
    });
  });
});
