/**
 * Shared directory creation utility
 *
 * Ensures a directory exists with secure permissions (0700).
 * Used across config, cache, logging, and settings modules.
 */

import { mkdirSync, existsSync } from 'fs';

/**
 * Ensure directory exists with secure permissions
 *
 * Creates directory and all parent directories if they don't exist.
 * Sets 0700 permissions (owner read/write/execute only) on Unix.
 *
 * @param dirPath - Absolute path to directory
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}
