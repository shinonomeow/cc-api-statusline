/**
 * Tests for cache garbage collection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync, writeFileSync, utimesSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCacheGC } from '../cache-gc.js';

describe('runCacheGC', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cache-gc-test-'));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a file with a specific mtime
   */
  function createFileWithAge(filename: string, ageMs: number): void {
    const filePath = join(testDir, filename);
    writeFileSync(filePath, 'test content');
    const targetTime = (Date.now() - ageMs) / 1000;
    utimesSync(filePath, targetTime, targetTime);
  }

  describe('age-based deletion', () => {
    it('should delete cache files older than 7 days', () => {
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      createFileWithAge('cache-old.json', eightDaysMs);
      createFileWithAge('cache-recent.json', 1000);

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'cache-old.json'))).toBe(false);
      expect(existsSync(join(testDir, 'cache-recent.json'))).toBe(true);
    });

    it('should delete provider-detect files older than 7 days', () => {
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      createFileWithAge('provider-detect-old.json', eightDaysMs);
      createFileWithAge('provider-detect-recent.json', 1000);

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'provider-detect-old.json'))).toBe(false);
      expect(existsSync(join(testDir, 'provider-detect-recent.json'))).toBe(true);
    });

    it('should delete orphaned .tmp files older than 1 hour', () => {
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const thirtyMinutesMs = 30 * 60 * 1000;
      createFileWithAge('cache-abc.123.tmp', twoHoursMs);
      createFileWithAge('cache-xyz.456.tmp', thirtyMinutesMs);

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'cache-abc.123.tmp'))).toBe(false);
      expect(existsSync(join(testDir, 'cache-xyz.456.tmp'))).toBe(true);
    });
  });

  describe('count-based deletion', () => {
    it('should keep only 20 most recent cache files', () => {
      // Create 25 cache files with different ages
      for (let i = 0; i < 25; i++) {
        const ageMs = i * 1000; // 0s, 1s, 2s, ... 24s ago
        createFileWithAge(`cache-${String(i).padStart(2, '0')}.json`, ageMs);
      }

      runCacheGC(testDir);

      const files = readdirSync(testDir).filter(f => f.startsWith('cache-') && f.endsWith('.json'));
      expect(files).toHaveLength(20);

      // The 5 oldest files should be deleted (files 20-24 were created first)
      for (let i = 20; i < 25; i++) {
        expect(existsSync(join(testDir, `cache-${String(i).padStart(2, '0')}.json`))).toBe(false);
      }
    });

    it('should not delete cache files when count is below threshold', () => {
      // Create 15 cache files
      for (let i = 0; i < 15; i++) {
        createFileWithAge(`cache-${i}.json`, i * 1000);
      }

      runCacheGC(testDir);

      const files = readdirSync(testDir).filter(f => f.startsWith('cache-') && f.endsWith('.json'));
      expect(files).toHaveLength(15);
    });

    it('should keep only 20 most recent provider-detect files', () => {
      for (let i = 0; i < 25; i++) {
        const ageMs = i * 1000;
        createFileWithAge(`provider-detect-${String(i).padStart(2, '0')}.json`, ageMs);
      }

      runCacheGC(testDir);

      const files = readdirSync(testDir).filter(f => f.startsWith('provider-detect-') && f.endsWith('.json'));
      expect(files).toHaveLength(20);

      // The 5 oldest should be deleted
      for (let i = 20; i < 25; i++) {
        expect(existsSync(join(testDir, `provider-detect-${String(i).padStart(2, '0')}.json`))).toBe(false);
      }
    });

    it('should not delete provider-detect files when count is below threshold', () => {
      for (let i = 0; i < 15; i++) {
        createFileWithAge(`provider-detect-${i}.json`, i * 1000);
      }

      runCacheGC(testDir);

      const files = readdirSync(testDir).filter(f => f.startsWith('provider-detect-') && f.endsWith('.json'));
      expect(files).toHaveLength(15);
    });
  });

  describe('file type preservation', () => {
    it('should not delete config.json', () => {
      createFileWithAge('config.json', 10 * 24 * 60 * 60 * 1000); // 10 days old

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'config.json'))).toBe(true);
    });

    it('should not delete debug.log', () => {
      createFileWithAge('debug.log', 10 * 24 * 60 * 60 * 1000); // 10 days old

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'debug.log'))).toBe(true);
    });

    it('should not delete unrelated files', () => {
      createFileWithAge('custom-file.txt', 10 * 24 * 60 * 60 * 1000);
      createFileWithAge('data.db', 10 * 24 * 60 * 60 * 1000);

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'custom-file.txt'))).toBe(true);
      expect(existsSync(join(testDir, 'data.db'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should not throw when directory does not exist', () => {
      const nonExistentDir = join(testDir, 'missing');
      expect(() => {
        runCacheGC(nonExistentDir);
      }).not.toThrow();
    });

    it('should not throw on file permission errors', () => {
      // This test is platform-dependent and may be skipped on some systems
      createFileWithAge('cache-test.json', 8 * 24 * 60 * 60 * 1000);
      // Note: Cannot reliably test permission errors in all environments
      expect(() => {
        runCacheGC(testDir);
      }).not.toThrow();
    });
  });

  describe('combined scenarios', () => {
    it('should handle age-based and count-based deletion together', () => {
      // Create 25 cache files
      for (let i = 0; i < 25; i++) {
        const ageMs = i < 10 ? i * 1000 : 8 * 24 * 60 * 60 * 1000; // First 10 recent, rest old
        createFileWithAge(`cache-${String(i).padStart(2, '0')}.json`, ageMs);
      }

      runCacheGC(testDir);

      const files = readdirSync(testDir).filter(f => f.startsWith('cache-') && f.endsWith('.json'));
      // Should have only 10 files (the recent ones, old ones deleted by age check)
      expect(files).toHaveLength(10);
    });

    it('should clean up all file types in one run', () => {
      // Old cache files
      createFileWithAge('cache-old-1.json', 8 * 24 * 60 * 60 * 1000);
      createFileWithAge('cache-old-2.json', 8 * 24 * 60 * 60 * 1000);
      // Old provider-detect files
      createFileWithAge('provider-detect-old.json', 8 * 24 * 60 * 60 * 1000);
      // Old .tmp files
      createFileWithAge('cache-abc.tmp', 2 * 60 * 60 * 1000);
      // Recent files
      createFileWithAge('cache-recent.json', 1000);
      createFileWithAge('provider-detect-recent.json', 1000);

      runCacheGC(testDir);

      expect(existsSync(join(testDir, 'cache-old-1.json'))).toBe(false);
      expect(existsSync(join(testDir, 'cache-old-2.json'))).toBe(false);
      expect(existsSync(join(testDir, 'provider-detect-old.json'))).toBe(false);
      expect(existsSync(join(testDir, 'cache-abc.tmp'))).toBe(false);
      expect(existsSync(join(testDir, 'cache-recent.json'))).toBe(true);
      expect(existsSync(join(testDir, 'provider-detect-recent.json'))).toBe(true);
    });
  });
});
