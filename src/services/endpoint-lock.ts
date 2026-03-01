/**
 * Endpoint Config Lock File Service
 *
 * Manages the .endpoint-config.lock file to enforce restart requirement
 * when endpoint configurations change.
 */

import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { atomicWriteFile } from './atomic-write.js';
import { getConfigDir } from './paths.js';

/**
 * Lock file entry structure
 */
export interface EndpointLockEntry {
  hash: string; // Hash of endpoint configs when lock was created
  lockedAt: string; // ISO-8601 timestamp when lock was created
}

/**
 * Get lock file path
 *
 * Default: ~/.claude/cc-api-statusline/.endpoint-config.lock
 */
export function getLockFilePath(customDir?: string): string {
  if (customDir) {
    return join(customDir, '.endpoint-config.lock');
  }
  return join(getConfigDir(), '.endpoint-config.lock');
}

/**
 * Read endpoint lock file
 *
 * Returns null if file doesn't exist or is invalid.
 */
export function readEndpointLock(customDir?: string): EndpointLockEntry | null {
  const lockPath = getLockFilePath(customDir);
  let content: string;

  try {
    content = readFileSync(lockPath, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    const data = JSON.parse(content) as unknown;

    if (
      typeof data === 'object' &&
      data !== null &&
      'hash' in data &&
      'lockedAt' in data &&
      typeof data.hash === 'string' &&
      typeof data.lockedAt === 'string'
    ) {
      return {
        hash: data.hash,
        lockedAt: data.lockedAt,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write endpoint lock file
 *
 * Creates or updates the lock file with the current hash.
 */
export function writeEndpointLock(hash: string, customDir?: string): void {
  const lockPath = getLockFilePath(customDir);
  const entry: EndpointLockEntry = {
    hash,
    lockedAt: new Date().toISOString(),
  };

  atomicWriteFile(lockPath, JSON.stringify(entry, null, 2), {
    ensureParentDir: true,
    appendNewline: true,
  });
}

/**
 * @internal — test-only
 *
 * Check if endpoint config is locked (matches current hash)
 *
 * Returns true if lock file exists and hash matches.
 * Returns false if lock file doesn't exist or hash differs.
 */
export function isEndpointConfigLocked(currentHash: string, customDir?: string): boolean {
  const lock = readEndpointLock(customDir);
  if (!lock) {
    return false; // No lock file means not locked (first run)
  }
  return lock.hash === currentHash;
}

/**
 * @internal — test-only
 *
 * Clear endpoint lock file
 *
 * Removes the lock file if it exists.
 */
export function clearEndpointLock(customDir?: string): void {
  const lockPath = getLockFilePath(customDir);
  try {
    unlinkSync(lockPath);
  } catch (e: unknown) {
    // Ignore ENOENT (file already deleted)
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
  }
}
