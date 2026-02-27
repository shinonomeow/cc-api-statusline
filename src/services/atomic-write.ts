/**
 * Shared atomic write utility
 *
 * Provides atomic file writes using .tmp + rename pattern.
 * Used across config, cache, and settings modules.
 */

import { writeFileSync, renameSync, unlinkSync, existsSync, chmodSync } from 'fs';
import { dirname } from 'path';
import { ensureDir } from './ensure-dir.js';

export interface AtomicWriteOptions {
  /**
   * File mode (default: 0o600)
   */
  mode?: number;

  /**
   * Ensure parent directory exists before writing (default: false)
   */
  ensureParentDir?: boolean;

  /**
   * Append newline at end of content (default: false)
   */
  appendNewline?: boolean;
}

/**
 * Write file atomically using .tmp + rename pattern
 *
 * Steps:
 * 1. Write content to {filePath}.tmp
 * 2. Set permissions on temp file
 * 3. Atomic rename from .tmp to final path
 * 4. Cleanup temp file on error
 *
 * @param filePath - Absolute path to target file
 * @param content - Content to write
 * @param opts - Write options
 * @throws Error if write fails
 */
export function atomicWriteFile(
  filePath: string,
  content: string,
  opts: AtomicWriteOptions = {}
): void {
  const { mode = 0o600, ensureParentDir: ensureParent = false, appendNewline = false } = opts;
  const tmpPath = `${filePath}.tmp`;

  try {
    // Ensure parent directory exists if requested
    if (ensureParent) {
      const dir = dirname(filePath);
      ensureDir(dir);
    }

    // Prepare content
    const finalContent = appendNewline ? `${content}\n` : content;

    // Write to temp file
    writeFileSync(tmpPath, finalContent, { encoding: 'utf-8', mode });

    // Try to set permissions explicitly (no-op on Windows)
    try {
      chmodSync(tmpPath, mode);
    } catch {
      // Ignore permission errors on Windows
    }

    // Atomic rename
    renameSync(tmpPath, filePath);
  } catch (error: unknown) {
    // Cleanup temp file on error
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    throw new Error(`Failed to write file atomically: ${error}`);
  }
}
