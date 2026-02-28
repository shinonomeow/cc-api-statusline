/**
 * Endpoint Configuration Service
 *
 * Loads, validates, and manages endpoint configurations from api-config/ folder.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { EndpointConfig, EndpointConfigRegistry } from '../types/endpoint-config.js';
import { sha256 } from './hash.js';
import { logger } from './logger.js';

/**
 * Get endpoint config directory path
 *
 * Default: ~/.claude/cc-api-statusline/api-config/
 * Can be overridden via:
 * - CC_API_STATUSLINE_CONFIG_DIR environment variable (for tests)
 * - customRoot parameter (for tests) - always appends api-config/
 */
export function getEndpointConfigDir(customRoot?: string): string {
  const envRoot = process.env['CC_API_STATUSLINE_CONFIG_DIR'];
  const root = customRoot || envRoot || join(homedir(), '.claude', 'cc-api-statusline');
  return join(root, 'api-config');
}

/**
 * Load all endpoint configs from api-config/ directory
 *
 * Reads all *.json files, validates them, and returns a registry.
 * Falls back to built-in configs if directory doesn't exist.
 */
export function loadEndpointConfigs(customDir?: string): EndpointConfigRegistry {
  const configDir = getEndpointConfigDir(customDir);

  if (!existsSync(configDir)) {
    // No config directory exists, return built-in defaults
    return getBuiltInEndpointConfigs();
  }

  const registry: EndpointConfigRegistry = {};
  const files = readdirSync(configDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    // Empty directory, return built-in defaults
    return getBuiltInEndpointConfigs();
  }

  for (const file of files) {
    const filePath = join(configDir, file);
    try {
      const config = loadEndpointConfigFile(filePath);
      registry[config.provider] = config;
    } catch (error: unknown) {
      // Log error but continue loading other files
      logger.error(`Failed to load endpoint config ${file}`, { error: String(error) });
    }
  }

  // If no configs loaded successfully, return built-in defaults
  if (Object.keys(registry).length === 0) {
    return getBuiltInEndpointConfigs();
  }

  return registry;
}

/**
 * Load and validate a single endpoint config file
 */
export function loadEndpointConfigFile(filePath: string): EndpointConfig {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as unknown;
  validateEndpointConfig(data, filePath);
  return data as EndpointConfig;
}

/**
 * Validate endpoint config structure
 *
 * Throws if config is invalid.
 */
export function validateEndpointConfig(data: unknown, filename: string): void {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`${filename}: Config must be an object`);
  }

  const config = data as Record<string, unknown>;

  // Required fields
  if (typeof config.provider !== 'string' || !config.provider) {
    throw new Error(`${filename}: Missing or invalid 'provider' field`);
  }

  if (typeof config.endpoint !== 'object' || config.endpoint === null) {
    throw new Error(`${filename}: Missing or invalid 'endpoint' field`);
  }

  const endpoint = config.endpoint as Record<string, unknown>;
  if (typeof endpoint.path !== 'string' || !endpoint.path) {
    throw new Error(`${filename}: Missing or invalid 'endpoint.path' field`);
  }

  if (endpoint.method !== 'GET' && endpoint.method !== 'POST') {
    throw new Error(`${filename}: Invalid 'endpoint.method' (must be GET or POST)`);
  }

  if (typeof config.auth !== 'object' || config.auth === null) {
    throw new Error(`${filename}: Missing or invalid 'auth' field`);
  }

  const auth = config.auth as Record<string, unknown>;
  if (!['bearer-header', 'body-key', 'custom-header'].includes(auth.type as string)) {
    throw new Error(`${filename}: Invalid 'auth.type' (must be bearer-header, body-key, or custom-header)`);
  }

  if (typeof config.responseMapping !== 'object' || config.responseMapping === null) {
    throw new Error(`${filename}: Missing or invalid 'responseMapping' field`);
  }

  // Validate responseMapping values (must be strings or undefined)
  const mapping = config.responseMapping as Record<string, unknown>;
  for (const [key, val] of Object.entries(mapping)) {
    if (val !== undefined && typeof val !== 'string') {
      throw new Error(`${filename}: responseMapping.${key} must be a string`);
    }
  }

  // Optional fields validation
  if (config.displayName !== undefined && typeof config.displayName !== 'string') {
    throw new Error(`${filename}: Invalid 'displayName' field (must be string)`);
  }

  if (config.defaults !== undefined && typeof config.defaults !== 'object') {
    throw new Error(`${filename}: Invalid 'defaults' field (must be object)`);
  }

  if (config.detection !== undefined && typeof config.detection !== 'object') {
    throw new Error(`${filename}: Invalid 'detection' field (must be object)`);
  }
}

/**
 * Compute deterministic hash of all endpoint config files
 *
 * Used for lock file comparison to detect endpoint config changes.
 * Hash is based on sorted file names and their content.
 */
export function computeEndpointConfigHash(customDir?: string): string {
  const configDir = getEndpointConfigDir(customDir);

  if (!existsSync(configDir)) {
    // No config directory, hash the built-in configs
    const builtIn = getBuiltInEndpointConfigs();
    const serialized = JSON.stringify(builtIn, Object.keys(builtIn).sort());
    return sha256(serialized).slice(0, 12);
  }

  const files = readdirSync(configDir)
    .filter(f => f.endsWith('.json'))
    .sort(); // Deterministic order

  if (files.length === 0) {
    // Empty directory, hash the built-in configs
    const builtIn = getBuiltInEndpointConfigs();
    const serialized = JSON.stringify(builtIn, Object.keys(builtIn).sort());
    return sha256(serialized).slice(0, 12);
  }

  // Concatenate all file contents in sorted order
  let combined = '';
  for (const file of files) {
    const filePath = join(configDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      combined += `\x00${file}\x00${content}`;
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return sha256(combined).slice(0, 12);
}

/**
 * Get built-in endpoint configs
 *
 * Returns hardcoded sub2api and CRS defaults.
 * Used as fallback when no config files exist.
 */
export function getBuiltInEndpointConfigs(): EndpointConfigRegistry {
  return {
    'sub2api': {
      provider: 'sub2api',
      displayName: 'sub2api',
      endpoint: {
        path: '/v1/usage',
        method: 'GET',
      },
      auth: {
        type: 'bearer-header',
      },
      defaults: {
        unit: 'USD',
        planName: 'Unknown',
      },
      detection: {
        healthMatch: { status: 'ok' },
      },
      responseMapping: {
        billingMode: 'subscription',
        planName: '$.planName',
        'balance.remaining': '$.remaining',
        'balance.unit': '$.unit',
        'daily.used': '$.subscription.daily_usage_usd',
        'daily.limit': '$.subscription.daily_limit_usd',
        'weekly.used': '$.subscription.weekly_usage_usd',
        'weekly.limit': '$.subscription.weekly_limit_usd',
        'monthly.used': '$.subscription.monthly_usage_usd',
        'monthly.limit': '$.subscription.monthly_limit_usd',
        'tokenStats.today.requests': '$.usage.today.requests',
        'tokenStats.today.inputTokens': '$.usage.today.input_tokens',
        'tokenStats.today.outputTokens': '$.usage.today.output_tokens',
        'tokenStats.today.cacheCreationTokens': '$.usage.today.cache_creation_tokens',
        'tokenStats.today.cacheReadTokens': '$.usage.today.cache_read_tokens',
        'tokenStats.today.totalTokens': '$.usage.today.total_tokens',
        'tokenStats.today.cost': '$.usage.today.cost',
        'tokenStats.total.requests': '$.usage.total.requests',
        'tokenStats.total.inputTokens': '$.usage.total.input_tokens',
        'tokenStats.total.outputTokens': '$.usage.total.output_tokens',
        'tokenStats.total.totalTokens': '$.usage.total.total_tokens',
        'tokenStats.total.cost': '$.usage.total.cost',
        'tokenStats.rpm': '$.usage.rpm',
        'tokenStats.tpm': '$.usage.tpm',
      },
    },
    'claude-relay-service': {
      provider: 'claude-relay-service',
      displayName: 'CRS',
      endpoint: {
        path: '/apiStats/api/user-stats',
        method: 'POST',
        contentType: 'application/json',
      },
      auth: {
        type: 'body-key',
        bodyField: 'apiKey',
      },
      defaults: {
        billingMode: 'subscription',
        planName: 'API Key',
        resetSemantics: 'rolling-window',
      },
      detection: {
        urlPatterns: ['/apistats', '/api/user-stats'],
        healthMatch: { service: '*' },
      },
      responseMapping: {
        billingMode: 'subscription',
        planName: '$.data.name',
        'daily.used': '$.data.limits.currentDailyCost',
        'daily.limit': '$.data.limits.dailyCostLimit',
        'weekly.used': '$.data.limits.weeklyOpusCost',
        'weekly.limit': '$.data.limits.weeklyOpusCostLimit',
        'monthly.used': '$.data.limits.currentTotalCost',
        'monthly.limit': '$.data.limits.totalCostLimit',
        'tokenStats.total.requests': '$.data.usage.total.requests',
        'tokenStats.total.inputTokens': '$.data.usage.total.inputTokens',
        'tokenStats.total.outputTokens': '$.data.usage.total.outputTokens',
        'tokenStats.total.cacheCreationTokens': '$.data.usage.total.cacheCreateTokens',
        'tokenStats.total.cacheReadTokens': '$.data.usage.total.cacheReadTokens',
        'tokenStats.total.totalTokens': '$.data.usage.total.tokens',
        'tokenStats.total.cost': '$.data.usage.total.cost',
        'rateLimit.windowSeconds': '$.data.limits.rateLimitWindow',
        'rateLimit.requestsUsed': '$.data.limits.currentWindowRequests',
        'rateLimit.requestsLimit': '$.data.limits.rateLimitRequests',
        'rateLimit.costUsed': '$.data.limits.currentWindowCost',
        'rateLimit.costLimit': '$.data.limits.rateLimitCost',
        'rateLimit.remainingSeconds': '$.data.limits.windowRemainingSeconds',
      },
    },
  };
}
