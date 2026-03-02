import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  loadConfigWithHash,
  saveConfig,
  getConfigPath,
  ensureConfigDir,
  readRawConfigBytes,
} from '../config.js';
import { getConfigDir } from '../paths.js';
import { DEFAULT_CONFIG, DEFAULT_TIER_THRESHOLDS, buildTiers } from '../../types/index.js';
import { writeDefaultConfigs } from '../config-defaults.js';
import { shortHash } from '../hash.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, readdirSync, readFileSync, rmSync } from 'fs';
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

  describe('loadConfigWithHash', () => {
    it('should return DEFAULT_CONFIG and empty-content hash when file does not exist', () => {
      const nonExistentPath = join(testDir, 'nonexistent.json');
      const result = loadConfigWithHash(nonExistentPath);

      expect(result.config).toEqual(DEFAULT_CONFIG);
      expect(result.configHash).toBe(shortHash('', 12));
    });

    it('should load config and hash raw content', () => {
      const configPath = join(testDir, 'config.json');
      const content = JSON.stringify({ display: { maxWidth: 80 } });

      writeFileSync(configPath, content, 'utf-8');

      const result = loadConfigWithHash(configPath);

      expect(result.config.display.maxWidth).toBe(80);
      expect(result.configHash).toBe(shortHash(content, 12));
    });

    it('should return DEFAULT_CONFIG but still hash invalid raw content', () => {
      const configPath = join(testDir, 'config.json');
      const content = 'invalid json {{{';

      writeFileSync(configPath, content, 'utf-8');

      const result = loadConfigWithHash(configPath);

      expect(result.config).toEqual(DEFAULT_CONFIG);
      expect(result.configHash).toBe(shortHash(content, 12));
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

  // ---------------------------------------------------------------------------
  // buildTiers and DEFAULT_TIER_THRESHOLDS
  // ---------------------------------------------------------------------------

  describe('buildTiers', () => {
    it('zips colors with default thresholds to produce 5 ColorTier objects', () => {
      const colors = ['a', 'b', 'c', 'd', 'e'];
      const tiers = buildTiers(colors);

      expect(tiers).toHaveLength(5);
      tiers.forEach((tier, i) => {
        expect(tier.color).toBe(colors[i]);
        expect(tier.maxPercent).toBe(DEFAULT_TIER_THRESHOLDS[i]);
      });
    });

    it('accepts custom thresholds and produces matching ColorTier objects', () => {
      const tiers = buildTiers(['x', 'y'], [50, 100]);

      expect(tiers).toEqual([
        { color: 'x', maxPercent: 50 },
        { color: 'y', maxPercent: 100 },
      ]);
    });

    it('throws when colors and thresholds lengths differ, with both lengths in message', () => {
      expect(() => buildTiers(['a', 'b'], [1, 2, 3]))
        .toThrow(/colors\.length \(2\).*thresholds\.length \(3\)/);
    });

    it('returns new array instances on each call (immutability)', () => {
      const colors = ['a', 'b', 'c', 'd', 'e'];
      const result1 = buildTiers(colors);
      const result2 = buildTiers(colors);

      expect(result1).not.toBe(result2);
    });
  });

  describe('DEFAULT_TIER_THRESHOLDS', () => {
    it('has 5 strictly ascending values ending at 100', () => {
      expect(DEFAULT_TIER_THRESHOLDS).toHaveLength(5);
      expect(DEFAULT_TIER_THRESHOLDS[DEFAULT_TIER_THRESHOLDS.length - 1]).toBe(100);

      for (let i = 1; i < DEFAULT_TIER_THRESHOLDS.length; i++) {
        expect(DEFAULT_TIER_THRESHOLDS[i] as number).toBeGreaterThan(DEFAULT_TIER_THRESHOLDS[i - 1] as number);
      }
    });

    it('all 7 predefined themes in DEFAULT_CONFIG share DEFAULT_TIER_THRESHOLDS maxPercent values', () => {
      const themeNames = ['auto', 'vibrant', 'pastel', 'bright', 'ocean', 'neutral', 'chill'] as const;

      for (const name of themeNames) {
        const entry = DEFAULT_CONFIG.colors?.[name];
        expect(entry).toBeDefined();
        expect(entry).toHaveProperty('tiers');
        // Each entry is a ColorTieredEntry with a tiers array
        const tieredEntry = entry as { tiers: ReadonlyArray<{ color: string; maxPercent: number }> };
        expect(tieredEntry.tiers).toHaveLength(DEFAULT_TIER_THRESHOLDS.length);

        tieredEntry.tiers.forEach((tier, i) => {
          expect(tier.maxPercent).toBe(DEFAULT_TIER_THRESHOLDS[i]);
        });
      }
    });
  });

  describe('writeDefaultConfigs — config.json colors exclusion', () => {
    let colorsTestDir: string;

    beforeEach(() => {
      colorsTestDir = join(tmpdir(), `cc-api-statusline-colors-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(colorsTestDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(colorsTestDir)) {
        rmSync(colorsTestDir, { recursive: true, force: true });
      }
    });

    it('config.json written by writeDefaultConfigs contains only the auto color alias', () => {
      writeDefaultConfigs(colorsTestDir);
      const raw = readFileSync(join(colorsTestDir, 'config.json'), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const colors = parsed['colors'];

      expect(colors).toBeDefined();
      expect(typeof colors).toBe('object');
      expect(colors).not.toBeNull();
      expect(Object.keys(colors as Record<string, unknown>)).toEqual(['auto']);
    });

    it('does not overwrite config.json if it already exists', () => {
      writeDefaultConfigs(colorsTestDir);
      const firstContent = readFileSync(join(colorsTestDir, 'config.json'), 'utf-8');
      // Simulate user change
      const modified = firstContent.replace('"display"', '"display_MODIFIED"');
      // Write modified content directly
      writeFileSync(join(colorsTestDir, 'config.json'), modified);
      // Call again - should not overwrite
      writeDefaultConfigs(colorsTestDir);
      const secondContent = readFileSync(join(colorsTestDir, 'config.json'), 'utf-8');
      expect(secondContent).toBe(modified); // original modification preserved
    });
  });
});
