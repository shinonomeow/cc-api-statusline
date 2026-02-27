/**
 * settings.json management service
 *
 * Handles reading, writing, and managing Claude Code settings.json for
 * statusline auto-setup.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { getSettingsJsonPath } from './env.js';
import { atomicWriteFile } from './atomic-write.js';

export interface ClaudeSettings {
  statusLine?: {
    type: string;
    command: string;
    padding: number;
  };
  [key: string]: unknown;
}

/**
 * Load Claude settings.json
 * Returns empty object if file doesn't exist.
 */
export function loadClaudeSettings(): ClaudeSettings {
  const path = getSettingsJsonPath();

  if (!existsSync(path)) {
    return {};
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (error: unknown) {
    console.warn(`Failed to read settings from ${path}: ${error}`);
    return {};
  }
}

/**
 * Save Claude settings.json atomically
 * Uses .tmp + rename pattern for atomic writes.
 */
export function saveClaudeSettings(settings: ClaudeSettings): void {
  const path = getSettingsJsonPath();

  try {
    // Serialize
    const content = JSON.stringify(settings, null, 2);

    // Write atomically with parent dir creation and newline
    atomicWriteFile(path, content, { ensureParentDir: true, appendNewline: true });
  } catch (error: unknown) {
    console.error(`Failed to write settings to ${path}: ${error}`);
    throw error;
  }
}

/**
 * Get existing statusLine configuration
 * Returns the command string or null if not configured.
 */
export function getExistingStatusLine(): string | null {
  const settings = loadClaudeSettings();
  return settings.statusLine?.command ?? null;
}

/**
 * Check if bunx is available on the system
 */
export function isBunxAvailable(): boolean {
  try {
    execSync('which bunx', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install statusLine configuration
 * Merges statusLine into existing settings, preserving other keys.
 *
 * @param runner - Package runner to use (npx or bunx)
 */
export function installStatusLine(runner: 'npx' | 'bunx'): void {
  const settings = loadClaudeSettings();

  const updatedSettings: ClaudeSettings = {
    ...settings,
    statusLine: {
      type: 'command',
      command: `${runner} -y cc-api-statusline@latest`,
      padding: 0,
    },
  };

  saveClaudeSettings(updatedSettings);
}

/**
 * Uninstall statusLine configuration
 * Removes statusLine key, preserves everything else.
 */
export function uninstallStatusLine(): void {
  const settings = loadClaudeSettings();

  if ('statusLine' in settings) {
    // Destructure to remove statusLine, rest contains all other keys
    const { statusLine: _, ...rest } = settings;
    saveClaudeSettings(rest);
  }
}
