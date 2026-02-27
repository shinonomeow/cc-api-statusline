/**
 * Tests for atomic-write utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync, readFileSync, statSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { atomicWriteFile } from '../atomic-write.js';

describe('atomicWriteFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'atomic-write-test-'));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should write content to file', () => {
    const filePath = join(testDir, 'test.txt');
    const content = 'Hello, World!';

    atomicWriteFile(filePath, content);

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should overwrite existing file', () => {
    const filePath = join(testDir, 'test.txt');
    writeFileSync(filePath, 'Old content');

    atomicWriteFile(filePath, 'New content');

    expect(readFileSync(filePath, 'utf-8')).toBe('New content');
  });

  it('should set custom file mode (Unix)', () => {
    if (process.platform === 'win32') {
      // Skip on Windows
      return;
    }

    const filePath = join(testDir, 'test.txt');
    atomicWriteFile(filePath, 'content', { mode: 0o644 });

    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o644);
  });

  it('should default to 0600 permissions (Unix)', () => {
    if (process.platform === 'win32') {
      // Skip on Windows
      return;
    }

    const filePath = join(testDir, 'test.txt');
    atomicWriteFile(filePath, 'content');

    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('should create parent directory when ensureParentDir is true', () => {
    const filePath = join(testDir, 'subdir', 'nested', 'test.txt');

    atomicWriteFile(filePath, 'content', { ensureParentDir: true });

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('content');
  });

  it('should throw when parent directory does not exist and ensureParentDir is false', () => {
    const filePath = join(testDir, 'missing', 'test.txt');

    expect(() => {
      atomicWriteFile(filePath, 'content');
    }).toThrow();
  });

  it('should append newline when appendNewline is true', () => {
    const filePath = join(testDir, 'test.txt');
    atomicWriteFile(filePath, 'content', { appendNewline: true });

    expect(readFileSync(filePath, 'utf-8')).toBe('content\n');
  });

  it('should not append newline by default', () => {
    const filePath = join(testDir, 'test.txt');
    atomicWriteFile(filePath, 'content');

    expect(readFileSync(filePath, 'utf-8')).toBe('content');
  });

  it('should cleanup temp file on write failure', () => {
    const filePath = join(testDir, 'readonly', 'test.txt');

    expect(() => {
      atomicWriteFile(filePath, 'content');
    }).toThrow();

    // No .tmp files should remain in testDir
    const files = readdirSync(testDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('should throw descriptive error on failure', () => {
    const filePath = join(testDir, 'missing', 'test.txt');

    expect(() => {
      atomicWriteFile(filePath, 'content');
    }).toThrow(/Failed to write file atomically/);
  });
});
