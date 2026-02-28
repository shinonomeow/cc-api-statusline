/**
 * Piped Mode Execution
 *
 * Handles piped mode (Claude Code widget) and --once mode execution.
 * Builds execution context, runs cycle, and formats output.
 */

import type { ParsedArgs } from './args.js';
import type { ExecutionContext } from '../core/index.js';
import { readCurrentEnv, validateRequiredEnv } from '../services/env.js';
import { readCache, writeCache, computeConfigHash, getCacheDir } from '../services/cache.js';
import { loadConfig, getConfigPath } from '../services/config.js';
import { loadEndpointConfigs, computeEndpointConfigHash } from '../services/endpoint-config.js';
import { readEndpointLock, writeEndpointLock } from '../services/endpoint-lock.js';
import { needsConfigInit, writeDefaultConfigs } from '../services/config-defaults.js';
import { resolveProvider, getProvider } from '../providers/index.js';
import { renderError } from '../renderer/error.js';
import { executeCycle } from '../core/index.js';
import { logger } from '../services/logger.js';
import { runCacheGC } from '../services/cache-gc.js';

function readAndValidateEnv(): { env: ReturnType<typeof readCurrentEnv>; baseUrl: string; authToken: string } {
  const env = readCurrentEnv();
  logger.debug('Environment loaded', {
    baseUrl: env.baseUrl ? `${env.baseUrl.substring(0, 30)}...` : undefined,
    hasToken: !!env.authToken,
    providerOverride: env.providerOverride,
    pollIntervalOverride: env.pollIntervalOverride
  });

  const envError = validateRequiredEnv(env);
  if (envError) {
    const errorOutput = renderError('missing-env', 'without-cache');
    process.stdout.write(errorOutput);
    process.exit(0);
  }

  const { baseUrl, authToken } = env;
  if (!baseUrl || !authToken) {
    process.exit(1);
  }

  return { env, baseUrl, authToken };
}

function ensureDefaultConfigs(): void {
  if (needsConfigInit()) {
    logger.debug('First run detected - initializing default configs');
    writeDefaultConfigs();
  }
}

function loadConfigWithHash(configPath?: string): { config: ReturnType<typeof loadConfig>; configPath: string; configHash: string } {
  const config = loadConfig(configPath);
  const resolvedPath = getConfigPath(configPath);
  const configHash = computeConfigHash(resolvedPath);
  logger.debug('Config loaded', { configPath: resolvedPath, configHash });
  return { config, configPath: resolvedPath, configHash };
}

function loadEndpointConfigsWithHash(): { endpointConfigs: ReturnType<typeof loadEndpointConfigs>; endpointConfigHash: string } {
  const endpointConfigs = loadEndpointConfigs();
  const endpointConfigHash = computeEndpointConfigHash();
  logger.debug('Endpoint configs loaded', {
    configCount: Object.keys(endpointConfigs).length,
    endpointConfigHash
  });
  return { endpointConfigs, endpointConfigHash };
}

function resolveEndpointLock(hash: string): ReturnType<typeof readEndpointLock> {
  let endpointLock = readEndpointLock();
  if (!endpointLock) {
    logger.debug('Endpoint lock file missing - creating with current hash');
    writeEndpointLock(hash);
    endpointLock = { hash, lockedAt: new Date().toISOString() };
  } else {
    logger.debug('Endpoint lock file loaded', {
      lockedHash: endpointLock.hash,
      currentHash: hash,
      locked: endpointLock.hash === hash
    });
  }
  return endpointLock;
}

async function resolveProviderWithTimeout(
  baseUrl: string,
  env: ReturnType<typeof readCurrentEnv>,
  endpointConfigs: ReturnType<typeof loadEndpointConfigs>,
  isPiped: boolean
): Promise<{ providerId: string; provider: NonNullable<ReturnType<typeof getProvider>> }> {
  const probeTimeout = isPiped
    ? Math.min(1500, Math.max(200, Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? 1000) - 200))
    : 3000;
  const providerId = await resolveProvider(baseUrl, env.providerOverride, endpointConfigs, probeTimeout);
  const provider = getProvider(providerId, endpointConfigs);
  logger.debug('Provider resolved', { providerId, probeTimeout });

  if (!provider) {
    logger.error('Provider not found', { providerId });
    const errorOutput = renderError('provider-unknown', 'without-cache');
    process.stdout.write(errorOutput);
    process.exit(0);
  }

  return { providerId, provider };
}

function computeTimeoutBudgets(isPiped: boolean, config: ReturnType<typeof loadConfig>): { timeoutBudgetMs: number; fetchTimeoutMs: number } {
  const timeoutBudgetMs = isPiped
    ? Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? 1000)
    : 10000;
  const fetchTimeoutMs = isPiped
    ? Math.min(config.pipedRequestTimeoutMs ?? 800, timeoutBudgetMs - 100)
    : 10000;
  return { timeoutBudgetMs, fetchTimeoutMs };
}

/**
 * Build execution context from arguments and environment
 */
async function buildExecutionContext(
  args: ParsedArgs,
  isPiped: boolean,
  startTime: number
): Promise<{ ctx: ExecutionContext; baseUrl: string }> {
  const { env, baseUrl } = readAndValidateEnv();
  ensureDefaultConfigs();
  const { config, configHash } = loadConfigWithHash(args.configPath);
  const { endpointConfigs, endpointConfigHash } = loadEndpointConfigsWithHash();
  const endpointLock = resolveEndpointLock(endpointConfigHash);
  const { providerId, provider } = await resolveProviderWithTimeout(baseUrl, env, endpointConfigs, isPiped);
  const cachedEntry = readCache(baseUrl);
  logger.debug('Cache read', {
    cacheHit: !!cachedEntry,
    cacheAge: cachedEntry ? `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s` : 'N/A'
  });
  const { timeoutBudgetMs, fetchTimeoutMs } = computeTimeoutBudgets(isPiped, config);

  const ctx: ExecutionContext = {
    env,
    config,
    configHash,
    endpointConfigHash,
    endpointLock,
    cachedEntry,
    providerId,
    provider,
    timeoutBudgetMs,
    startTime,
    fetchTimeoutMs,
  };

  return { ctx, baseUrl };
}

/**
 * Format output for piped mode
 *
 * Applies host-specific formatting:
 * 1. Prepend \x1b[0m to reset Claude Code's dim styling
 * 2. Replace spaces with NBSP (\u00A0) to prevent VSCode trimming
 */
function formatOutput(output: string, isPiped: boolean): string {
  let normalizedOutput = output;

  // Guard against empty output
  if (!normalizedOutput || normalizedOutput.trim().length === 0) {
    logger.debug('Empty output detected, using fallback');
    normalizedOutput = '[loading...]';
  }

  if (isPiped) {
    logger.debug('Output formatted for piped mode (ANSI reset + NBSP)');
    return '\x1b[0m' + normalizedOutput.replace(/ /g, '\u00A0');
  } else {
    logger.debug('Output written (TTY mode)');
    return normalizedOutput;
  }
}

/**
 * Execute piped mode (or --once mode)
 */
export async function executePipedMode(args: ParsedArgs): Promise<void> {
  // Record start time for deadline tracking
  const startTime = Date.now();

  logger.debug('=== cc-api-statusline execution started ===');
  logger.debug('Start time', { startTime });

  // Detect mode: piped (stdin not TTY) or TTY
  const isPiped = !process.stdin.isTTY;
  logger.debug('Mode detection', { isPiped, once: args.once });

  // Build execution context
  let ctx: ExecutionContext;
  let baseUrl: string;
  try {
    ({ ctx, baseUrl } = await buildExecutionContext(args, isPiped, startTime));
  } catch (error: unknown) {
    logger.error('Failed to build execution context', { error: String(error) });
    const errorOutput = renderError('network-error', 'without-cache');
    const formattedOutput = formatOutput(errorOutput, isPiped);
    process.stdout.write(formattedOutput);
    logger.debug('=== cc-api-statusline execution completed ===');
    process.exit(0);
  }

  // Execute cycle
  logger.debug('Execution context prepared', {
    timeoutBudgetMs: ctx.timeoutBudgetMs,
    fetchTimeoutMs: ctx.fetchTimeoutMs
  });
  const result = await executeCycle(ctx);

  const executionTime = Date.now() - startTime;
  logger.debug('Execution completed', {
    exitCode: result.exitCode,
    executionTime: `${executionTime}ms`,
    outputLength: result.output.length,
    cacheUpdate: !!result.cacheUpdate
  });

  // Format and write output
  const formattedOutput = formatOutput(result.output, isPiped);
  process.stdout.write(formattedOutput);

  // Write cache update if present
  if (result.cacheUpdate) {
    writeCache(baseUrl, result.cacheUpdate);
    logger.debug('Cache written', { baseUrl });

    // Run garbage collection after successful cache write
    runCacheGC(getCacheDir());
  }

  logger.debug('=== cc-api-statusline execution completed ===');

  process.exit(result.exitCode);
}
