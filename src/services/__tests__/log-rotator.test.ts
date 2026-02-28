/**
 * Tests for log rotation service
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, utimesSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { spawn } from 'child_process';
import { archiveName, maybeRotateLogs } from '../log-rotator.js';

// --- archiveName ---

describe('archiveName', () => {
  it('formats archive path with date and hour-minute', () => {
    const result = archiveName('/tmp/test/debug.log', new Date('2026-01-28T14:30:00Z'));
    expect(result).toMatch(/^\/tmp\/test\/debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/);
  });

  it('places archive in same directory as log', () => {
    const result = archiveName('/some/dir/debug.log');
    expect(result).toMatch(/^\/some\/dir\/debug\./);
  });
});

// --- maybeRotateLogs ---

describe('maybeRotateLogs', () => {
  let testDir: string;
  let logPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'log-rotator-test-'));
    logPath = join(testDir, 'debug.log');
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function createFile(path: string, sizeBytes: number, ageMs: number): void {
    writeFileSync(path, 'x'.repeat(sizeBytes));
    const mtime = (Date.now() - ageMs) / 1000;
    utimesSync(path, mtime, mtime);
  }

  // Gate tests
  it('skips entirely when random roll misses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    createFile(logPath, 600 * 1024, 1000); // large file, but gate blocks
    maybeRotateLogs(logPath);
    expect(existsSync(logPath)).toBe(true); // untouched
  });

  it('handles missing log file gracefully', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    expect(() => { maybeRotateLogs(logPath); }).not.toThrow();
  });

  // No rotation
  it('does NOT rotate when file is small and recent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    createFile(logPath, 100, 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(logPath)).toBe(true);
    const archives = readdirSync(testDir).filter(f => f !== 'debug.log');
    expect(archives).toHaveLength(0);
  });

  // Size-based rotation
  it('renames to .log (no gzip) when size >= 500 KB and age < 24h', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    createFile(logPath, 512 * 1024, 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(logPath)).toBe(false);
    const archives = readdirSync(testDir).filter(f =>
      /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/.test(f)
    );
    expect(archives).toHaveLength(1);
    expect(spawn).not.toHaveBeenCalled(); // no gzip for recent files
  });

  // Age-based rotation
  it('renames and spawns gzip when age >= 24h', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    createFile(logPath, 1000, 25 * 60 * 60 * 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(logPath)).toBe(false);
    // gzip called exactly once (not double-called by cleanup)
    const gzipCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]: [string]) => cmd === 'gzip'
    );
    expect(gzipCalls).toHaveLength(1);
    expect(gzipCalls[0][2]).toEqual(expect.objectContaining({ detached: true }));
  });
});

// --- cleanup pass ---

describe('cleanup pass', () => {
  let testDir: string;
  let logPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'log-rotator-cleanup-'));
    logPath = join(testDir, 'debug.log');
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function createArchive(name: string, ageMs: number): void {
    const filePath = join(testDir, name);
    writeFileSync(filePath, 'archive content');
    const mtime = (Date.now() - ageMs) / 1000;
    utimesSync(filePath, mtime, mtime);
  }

  it('spawns gzip for .log archives older than 24h', () => {
    createArchive('debug.2026-01-27T06-00.log', 25 * 60 * 60 * 1000);
    maybeRotateLogs(logPath);
    expect(spawn).toHaveBeenCalledWith(
      'gzip',
      ['-f', join(testDir, 'debug.2026-01-27T06-00.log')],
      expect.objectContaining({ detached: true })
    );
  });

  it('deletes .log.gz archives older than 3 days', () => {
    createArchive('debug.2026-01-25T00-00.log.gz', 4 * 24 * 60 * 60 * 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'debug.2026-01-25T00-00.log.gz'))).toBe(false);
  });

  it('does NOT gzip .log archives younger than 24h', () => {
    createArchive('debug.2026-01-28T14-30.log', 1000);
    maybeRotateLogs(logPath);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does NOT delete .log.gz archives younger than 3 days', () => {
    createArchive('debug.2026-01-27T06-00.log.gz', 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'debug.2026-01-27T06-00.log.gz'))).toBe(true);
  });

  it('does not touch unrelated files', () => {
    createArchive('config.json', 10 * 24 * 60 * 60 * 1000);
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'config.json'))).toBe(true);
  });
});
