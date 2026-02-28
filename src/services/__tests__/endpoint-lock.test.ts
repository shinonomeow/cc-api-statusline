import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getLockFilePath,
  readEndpointLock,
  writeEndpointLock,
  isEndpointConfigLocked,
  clearEndpointLock,
} from '../endpoint-lock.js';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `endpoint-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getLockFilePath
// ---------------------------------------------------------------------------

describe('getLockFilePath', () => {
  it('returns path inside custom dir when arg is provided', () => {
    const result = getLockFilePath(testDir);
    expect(result).toBe(join(testDir, '.endpoint-config.lock'));
  });

  it('returns default path containing .claude when no arg is provided', () => {
    const result = getLockFilePath();
    expect(result).toContain('.claude');
    expect(result).toContain('.endpoint-config.lock');
  });
});

// ---------------------------------------------------------------------------
// readEndpointLock
// ---------------------------------------------------------------------------

describe('readEndpointLock', () => {
  it('returns null when lock file does not exist', () => {
    const result = readEndpointLock(testDir);
    expect(result).toBeNull();
  });

  it('returns object with hash and lockedAt for valid JSON', () => {
    const lockPath = join(testDir, '.endpoint-config.lock');
    const entry = { hash: 'abc123', lockedAt: '2026-02-28T00:00:00.000Z' };
    writeFileSync(lockPath, JSON.stringify(entry), 'utf-8');

    const result = readEndpointLock(testDir);

    expect(result).not.toBeNull();
    expect(result?.hash).toBe('abc123');
    expect(result?.lockedAt).toBe('2026-02-28T00:00:00.000Z');
  });

  it('returns null for invalid JSON content', () => {
    const lockPath = join(testDir, '.endpoint-config.lock');
    writeFileSync(lockPath, 'not { valid json', 'utf-8');

    const result = readEndpointLock(testDir);

    expect(result).toBeNull();
  });

  it('returns null when JSON is valid but missing hash field', () => {
    const lockPath = join(testDir, '.endpoint-config.lock');
    writeFileSync(lockPath, JSON.stringify({ lockedAt: '2026-02-28T00:00:00.000Z' }), 'utf-8');

    const result = readEndpointLock(testDir);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeEndpointLock
// ---------------------------------------------------------------------------

describe('writeEndpointLock', () => {
  it('creates lock file with correct hash and ISO timestamp', () => {
    const before = new Date();
    writeEndpointLock('deadbeef', testDir);
    const after = new Date();

    const lockPath = join(testDir, '.endpoint-config.lock');
    expect(existsSync(lockPath)).toBe(true);

    const raw = JSON.parse(readFileSync(lockPath, 'utf-8')) as { hash: string; lockedAt: string };
    expect(raw.hash).toBe('deadbeef');

    const lockedAt = new Date(raw.lockedAt);
    expect(lockedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lockedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('creates parent directories when they do not exist', () => {
    const nestedDir = join(testDir, 'a', 'b', 'c');
    expect(existsSync(nestedDir)).toBe(false);

    writeEndpointLock('hash1', nestedDir);

    const lockPath = join(nestedDir, '.endpoint-config.lock');
    expect(existsSync(lockPath)).toBe(true);
  });

  it('overwrites an existing lock file with the new hash', () => {
    writeEndpointLock('first-hash', testDir);
    writeEndpointLock('second-hash', testDir);

    const lockPath = join(testDir, '.endpoint-config.lock');
    const raw = JSON.parse(readFileSync(lockPath, 'utf-8')) as { hash: string };
    expect(raw.hash).toBe('second-hash');
  });
});

// ---------------------------------------------------------------------------
// isEndpointConfigLocked
// ---------------------------------------------------------------------------

describe('isEndpointConfigLocked', () => {
  it('returns false when no lock file exists', () => {
    const result = isEndpointConfigLocked('anyhash', testDir);
    expect(result).toBe(false);
  });

  it('returns true when lock file hash matches current hash', () => {
    writeEndpointLock('match-hash', testDir);
    const result = isEndpointConfigLocked('match-hash', testDir);
    expect(result).toBe(true);
  });

  it('returns false when lock file hash differs from current hash', () => {
    writeEndpointLock('old-hash', testDir);
    const result = isEndpointConfigLocked('new-hash', testDir);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearEndpointLock
// ---------------------------------------------------------------------------

describe('clearEndpointLock', () => {
  it('deletes an existing lock file', () => {
    writeEndpointLock('todelete', testDir);
    const lockPath = join(testDir, '.endpoint-config.lock');
    expect(existsSync(lockPath)).toBe(true);

    clearEndpointLock(testDir);

    expect(existsSync(lockPath)).toBe(false);
  });

  it('does not throw when lock file is already absent', () => {
    expect(() => { clearEndpointLock(testDir); }).not.toThrow();
  });
});
