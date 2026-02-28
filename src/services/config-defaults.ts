/**
 * Config Defaults Service
 *
 * Provides default config content and auto-creates config files
 * on first run or --install.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Config } from '../types/index.js';
import type { EndpointConfig } from '../types/endpoint-config.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { atomicWriteFile } from './atomic-write.js';
import { ensureDir } from './ensure-dir.js';
import { getEndpointConfigDir, computeEndpointConfigHash, getBuiltInEndpointConfigs } from './endpoint-config.js';
import { writeEndpointLock } from './endpoint-lock.js';

/**
 * Get default style config (config.json content)
 *
 * Returns DEFAULT_CONFIG from types/config.ts.
 * This is style and timing only — no endpoint configs.
 */
export function getDefaultStyleConfig(): Config {
  return DEFAULT_CONFIG;
}

/**
 * Get default sub2api endpoint config (single source of truth)
 */
export function getDefaultSub2apiConfig(): EndpointConfig {
  const configs = getBuiltInEndpointConfigs();
  const config = configs['sub2api'];
  if (!config) throw new Error('Built-in sub2api config not found');
  return config;
}

/**
 * Get default CRS endpoint config (single source of truth)
 */
export function getDefaultCrsConfig(): EndpointConfig {
  const configs = getBuiltInEndpointConfigs();
  const config = configs['claude-relay-service'];
  if (!config) throw new Error('Built-in claude-relay-service config not found');
  return config;
}

/**
 * Write default config files
 *
 * Creates:
 * - config.json (style config)
 * - api-config/sub2api.json
 * - api-config/crs.json
 * - .endpoint-config.lock
 *
 * Idempotent: doesn't overwrite existing files.
 */
export function writeDefaultConfigs(customDir?: string): void {
  const configDir = customDir || join(homedir(), '.claude', 'cc-api-statusline');
  const configPath = join(configDir, 'config.json');
  const apiConfigDir = getEndpointConfigDir(customDir);

  // Ensure directories exist
  ensureDir(configDir);
  ensureDir(apiConfigDir);

  // Write config.json if it doesn't exist
  if (!existsSync(configPath)) {
    const styleConfig = getDefaultStyleConfig();
    atomicWriteFile(configPath, JSON.stringify(styleConfig, null, 2), {
      appendNewline: true,
    });
  }

  // Write api-config/sub2api.json if it doesn't exist
  const sub2apiPath = join(apiConfigDir, 'sub2api.json');
  if (!existsSync(sub2apiPath)) {
    const sub2apiConfig = getDefaultSub2apiConfig();
    atomicWriteFile(sub2apiPath, JSON.stringify(sub2apiConfig, null, 2), {
      appendNewline: true,
    });
  }

  // Write api-config/crs.json if it doesn't exist
  const crsPath = join(apiConfigDir, 'crs.json');
  if (!existsSync(crsPath)) {
    const crsConfig = getDefaultCrsConfig();
    atomicWriteFile(crsPath, JSON.stringify(crsConfig, null, 2), {
      appendNewline: true,
    });
  }

  // Write lock file with current hash
  const currentHash = computeEndpointConfigHash(customDir);
  writeEndpointLock(currentHash, customDir);
}

/**
 * Check if config initialization is needed
 *
 * Returns true if:
 * - config.json doesn't exist, OR
 * - api-config/ directory doesn't exist
 */
export function needsConfigInit(customDir?: string): boolean {
  const configDir = customDir || join(homedir(), '.claude', 'cc-api-statusline');
  const configPath = join(configDir, 'config.json');
  const apiConfigDir = getEndpointConfigDir(customDir);

  return !existsSync(configPath) || !existsSync(apiConfigDir);
}
