/**
 * Configuration management
 *
 * Load/save/merge JSON config, defaults, validation
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Config } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { ensureDir } from './ensure-dir.js';
import { atomicWriteFile } from './atomic-write.js';

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  return join(homedir(), '.claude', 'cc-api-statusline');
}

/**
 * Get config file path
 */
export function getConfigPath(customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  return join(getConfigDir(), 'config.json');
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  const dir = getConfigDir();
  ensureDir(dir);
}

/**
 * Deep merge objects (simple recursive merge)
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Validate and clamp config values (immutable)
 */
function validateConfig(config: Config): Config {
  let maxWidth = config.display.maxWidth;
  let pollIntervalSeconds = config.pollIntervalSeconds;
  let pipedRequestTimeoutMs = config.pipedRequestTimeoutMs;

  // Clamp maxWidth to 20-100
  if (maxWidth < 20) {
    console.warn('Warning: display.maxWidth < 20, clamping to 20');
    maxWidth = 20;
  }
  if (maxWidth > 100) {
    console.warn('Warning: display.maxWidth > 100, clamping to 100');
    maxWidth = 100;
  }

  // Validate pollIntervalSeconds >= 5
  if (pollIntervalSeconds !== undefined && pollIntervalSeconds < 5) {
    console.warn('Warning: pollIntervalSeconds < 5, clamping to 5');
    pollIntervalSeconds = 5;
  }

  // Validate pipedRequestTimeoutMs
  if (pipedRequestTimeoutMs !== undefined && pipedRequestTimeoutMs < 100) {
    console.warn('Warning: pipedRequestTimeoutMs < 100, clamping to 100');
    pipedRequestTimeoutMs = 100;
  }

  return {
    ...config,
    display: {
      ...config.display,
      maxWidth,
    },
    pollIntervalSeconds,
    pipedRequestTimeoutMs,
  };
}

/**
 * Load config from file, merge with defaults
 *
 * If file doesn't exist, returns DEFAULT_CONFIG.
 * If file is invalid JSON, logs warning and returns DEFAULT_CONFIG.
 */
export function loadConfig(configPath?: string): Config {
  const path = getConfigPath(configPath);

  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const userConfig = JSON.parse(content) as Partial<Config>;

    // Deep merge with defaults
    const merged = deepMerge(DEFAULT_CONFIG, userConfig);

    // Validate and clamp values
    return validateConfig(merged);
  } catch (error: unknown) {
    console.warn(`Warning: Could not load config from ${path}: ${error}`);
    console.warn('Using default configuration');
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to file (atomic write)
 *
 * Writes to .tmp file first, then renames for atomicity.
 * Sets 0600 permissions on Unix.
 */
export function saveConfig(config: Config, configPath?: string): void {
  const path = getConfigPath(configPath);

  // Ensure directory exists
  ensureConfigDir();

  // Exclude colors from serialization — colors are derived at runtime from the
  // theme and must not be persisted, otherwise a stale override re-introduced
  // here would shadow future theme changes.
  const { colors: _colors, ...configWithoutColors } = config as Config & { colors?: unknown };

  // Write atomically
  const content = JSON.stringify(configWithoutColors, null, 2);

  try {
    atomicWriteFile(path, content);
  } catch (error: unknown) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

/**
 * Read raw config file bytes (for configHash computation)
 *
 * Returns null if file doesn't exist.
 * This is used for fast-path cache validation in piped mode.
 */
export function readRawConfigBytes(configPath?: string): Buffer | null {
  const path = getConfigPath(configPath);

  if (!existsSync(path)) {
    return null;
  }

  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}
