/**
 * Environment variable reading with settings.json overlay
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { shortHash } from './hash.js';
import { logger } from './logger.js';

/**
 * Environment snapshot
 */
export interface EnvSnapshot {
  baseUrl: string | null;
  authToken: string | null;
  tokenHash: string | null; // shortHash of authToken, for cache validation
  providerOverride: string | null; // CC_STATUSLINE_PROVIDER
  pollIntervalOverride: number | null; // CC_STATUSLINE_POLL (seconds)
}

/**
 * Get settings.json path from CLAUDE_CONFIG_DIR or default
 */
export function getSettingsJsonPath(): string {
  const configDir = process.env['CLAUDE_CONFIG_DIR'];
  if (configDir) {
    return join(configDir, 'settings.json');
  }
  return join(homedir(), '.claude', 'settings.json');
}

/**
 * Read settings.json and extract env overlay
 */
function readSettingsJsonEnv(): Record<string, string> {
  const settingsPath = getSettingsJsonPath();
  let content: string;

  try {
    content = readFileSync(settingsPath, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }

  try {
    const settings = JSON.parse(content) as Record<string, unknown>;

    // Extract env field
    if (settings['env'] && typeof settings['env'] === 'object') {
      const env = settings['env'] as Record<string, unknown>;
      const result: Record<string, string> = {};

      // Convert all env values to strings
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          result[key] = value;
        } else if (
          value !== null &&
          value !== undefined &&
          (typeof value === 'number' || typeof value === 'boolean')
        ) {
          result[key] = String(value);
        }
      }

      return result;
    }

    return {};
  } catch (err: unknown) {
    // Ignore errors reading settings.json - not critical
    logger.warn(`Could not read settings.json: ${err}`);
    return {};
  }
}

/**
 * Read current environment with settings.json overlay
 *
 * Priority: settings.json env field > process.env
 * (matches Claude Code's behavior per spec-api-polling.md:224)
 */
export function readCurrentEnv(): EnvSnapshot {
  // Read settings.json env overlay
  const settingsEnv = readSettingsJsonEnv();

  // Get environment variables with overlay
  // settings.json overrides process.env
  const getEnv = (key: string): string | null => {
    return settingsEnv[key] ?? process.env[key] ?? null;
  };

  const baseUrl = getEnv('ANTHROPIC_BASE_URL');
  const authToken = getEnv('ANTHROPIC_AUTH_TOKEN');
  const providerOverride = getEnv('CC_STATUSLINE_PROVIDER');
  const pollIntervalRaw = getEnv('CC_STATUSLINE_POLL');

  // Compute token hash if token is present
  const tokenHash = authToken ? shortHash(authToken, 12) : null;

  // Parse poll interval override
  let pollIntervalOverride: number | null = null;
  if (pollIntervalRaw) {
    const parsed = parseInt(pollIntervalRaw, 10);
    if (!isNaN(parsed) && parsed >= 5) {
      pollIntervalOverride = parsed;
    }
  }

  return {
    baseUrl,
    authToken,
    tokenHash,
    providerOverride,
    pollIntervalOverride,
  };
}

/**
 * Validate required environment variables
 *
 * Returns error message if validation fails, null if OK
 */
export function validateRequiredEnv(env: EnvSnapshot): string | null {
  if (!env.baseUrl) {
    return 'Missing required environment variable: ANTHROPIC_BASE_URL';
  }

  if (!env.authToken) {
    return 'Missing required environment variable: ANTHROPIC_AUTH_TOKEN';
  }

  return null;
}
