/**
 * Tests for ensure-dir utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureDir } from '../ensure-dir.js';

describe('ensureDir', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'ensure-dir-test-'));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create directory if it does not exist', () => {
    const targetDir = join(testDir, 'new-dir');
    expect(existsSync(targetDir)).toBe(false);

    ensureDir(targetDir);

    expect(existsSync(targetDir)).toBe(true);
  });

  it('should create parent directories recursively', () => {
    const targetDir = join(testDir, 'parent', 'child', 'grandchild');
    expect(existsSync(targetDir)).toBe(false);

    ensureDir(targetDir);

    expect(existsSync(targetDir)).toBe(true);
  });

  it('should not throw if directory already exists', () => {
    const targetDir = join(testDir, 'existing-dir');
    ensureDir(targetDir);
    expect(existsSync(targetDir)).toBe(true);

    // Should not throw
    expect(() => {
      ensureDir(targetDir);
    }).not.toThrow();
  });

  it('should set 0700 permissions on created directory (Unix)', () => {
    if (process.platform === 'win32') {
      // Skip on Windows
      return;
    }

    const targetDir = join(testDir, 'secure-dir');
    ensureDir(targetDir);

    const stats = statSync(targetDir);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o700);
  });
});
