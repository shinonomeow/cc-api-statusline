/**
 * Piped Mode Execution
 *
 * Handles piped mode (Claude Code widget) and --once mode execution.
 * Builds execution context, runs cycle, and formats output.
 */

import type { ParsedArgs } from './args.js';
import type { ExecutionContext } from '../core/index.js';
import type { Config } from '../types/config.js';
import type { EnvSnapshot } from '../services/env.js';
import type { EndpointConfigRegistry } from '../types/index.js';
import type { EndpointLockEntry } from '../services/endpoint-lock.js';
import type { ErrorState } from '../renderer/error.js';
import { readCurrentEnv, validateRequiredEnv } from '../services/env.js';
import { readCache, writeCache, getCacheDir, isCacheValid } from '../services/cache.js';
import { loadConfigWithHash } from '../services/config.js';
import { loadEndpointConfigs, computeEndpointConfigHash } from '../services/endpoint-config.js';
import { readEndpointLock, writeEndpointLock } from '../services/endpoint-lock.js';
import { needsConfigInit, writeDefaultConfigs } from '../services/config-defaults.js';
import { resolveProvider, getProvider } from '../providers/index.js';
import { renderError } from '../renderer/error.js';
import { dimText } from '../renderer/colors.js';
import { executeCycle } from '../core/index.js';
import { DEFAULT_PIPED_REQUEST_TIMEOUT_MS } from '../core/constants.js';
import { logger } from '../services/logger.js';
import { runCacheGC } from '../services/cache-gc.js';

class StatuslineError extends Error {
  constructor(public readonly errorType: ErrorState) {
    super(errorType);
  }
}

function safeStdoutWrite(data: string): void {
  try {
    process.stdout['write'](data);
  } catch {
    // EPIPE — pipe closed, exit silently
  }
}

function readAndValidateEnv(): { env: EnvSnapshot; baseUrl: string } {
  const env = readCurrentEnv();
  logger.debug('Environment loaded', {
    baseUrl: env.baseUrl ? `${env.baseUrl.substring(0, 30)}...` : undefined,
    hasToken: !!env.authToken,
    providerOverride: env.providerOverride,
    pollIntervalOverride: env.pollIntervalOverride
  });

  const envError = validateRequiredEnv(env);
  if (envError) {
    throw new StatuslineError('missing-env');
  }

  const { baseUrl } = env;
  if (!baseUrl) {
    process.exit(0);
  }

  return { env, baseUrl };
}

function ensureDefaultConfigs(): void {
  if (needsConfigInit()) {
    logger.debug('First run detected - initializing default configs');
    writeDefaultConfigs();
  }
}

function loadEndpointConfigsWithHash(): { endpointConfigs: EndpointConfigRegistry; endpointConfigHash: string } {
  const endpointConfigs = loadEndpointConfigs();
  const endpointConfigHash = computeEndpointConfigHash();
  logger.debug('Endpoint configs loaded', {
    configCount: Object.keys(endpointConfigs).length,
    endpointConfigHash
  });
  return { endpointConfigs, endpointConfigHash };
}

function resolveEndpointLock(hash: string): EndpointLockEntry {
  const existing = readEndpointLock();
  if (existing) {
    logger.debug('Endpoint lock file loaded', {
      lockedHash: existing.hash,
      currentHash: hash,
      locked: existing.hash === hash
    });
    return existing;
  }
  logger.debug('Endpoint lock file missing - creating with current hash');
  writeEndpointLock(hash);
  return { hash, lockedAt: new Date().toISOString() };
}

async function resolveProviderWithTimeout(
  baseUrl: string,
  env: EnvSnapshot,
  endpointConfigs: EndpointConfigRegistry,
  isPiped: boolean,
  timeoutMs: number
): Promise<{ providerId: string; provider: NonNullable<ReturnType<typeof getProvider>> }> {
  const probeTimeout = isPiped
    ? Math.min(1500, Math.max(200, timeoutMs - 200))
    : 3000;
  const providerId = await resolveProvider(baseUrl, env.providerOverride, endpointConfigs, probeTimeout);
  const provider = getProvider(providerId, endpointConfigs);
  logger.debug('Provider resolved', { providerId, probeTimeout });

  if (!provider) {
    logger.error('Provider not found', { providerId });
    throw new StatuslineError('provider-unknown');
  }

  return { providerId, provider };
}

function computeTimeoutBudgets(isPiped: boolean, config: Config, timeoutMs: number): { timeoutBudgetMs: number; fetchTimeoutMs: number } {
  const timeoutBudgetMs = isPiped ? timeoutMs : 10000;
  const fetchTimeoutMs = isPiped
    ? Math.min(config.pipedRequestTimeoutMs ?? DEFAULT_PIPED_REQUEST_TIMEOUT_MS, timeoutBudgetMs - 100)
    : 10000;
  return { timeoutBudgetMs, fetchTimeoutMs };
}

/**
 * Build execution context from arguments and environment
 */
async function buildExecutionContext(
  args: ParsedArgs,
  isPiped: boolean,
  startTime: number,
  rawTimeoutMs: number
): Promise<{ ctx: ExecutionContext; baseUrl: string }> {
  const { env, baseUrl } = readAndValidateEnv();
  ensureDefaultConfigs();
  const { config, configHash } = loadConfigWithHash(args.configPath);
  const { endpointConfigs, endpointConfigHash } = loadEndpointConfigsWithHash();
  const endpointLock = resolveEndpointLock(endpointConfigHash);

  // Cache-first: read cache before probing provider — saves up to 800ms on warm cache
  const cachedEntry = readCache(baseUrl);
  logger.debug('Cache read', {
    cacheHit: !!cachedEntry,
    cacheAge: cachedEntry ? `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s` : 'N/A'
  });

  let providerId: string;
  let provider: NonNullable<ReturnType<typeof getProvider>>;

  if (cachedEntry && isCacheValid(cachedEntry, env)) {
    const cachedProvider = getProvider(cachedEntry.provider, endpointConfigs);
    if (cachedProvider) {
      // Fast path: cache is valid and provider is known — skip the health probe
      providerId = cachedEntry.provider;
      provider = cachedProvider;
      logger.debug('Cache-first: skipping provider probe', { providerId });
    } else {
      ({ providerId, provider } = await resolveProviderWithTimeout(baseUrl, env, endpointConfigs, isPiped, rawTimeoutMs));
    }
  } else {
    ({ providerId, provider } = await resolveProviderWithTimeout(baseUrl, env, endpointConfigs, isPiped, rawTimeoutMs));
  }

  const { timeoutBudgetMs, fetchTimeoutMs } = computeTimeoutBudgets(isPiped, config, rawTimeoutMs);

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

  // Read timeout early — needed for both watchdog and buildExecutionContext
  const rawTimeoutMs = Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? 5000);

  // Watchdog timer: exit cleanly before Claude Code's SIGKILL deadline
  // Fires rawTimeoutMs-100ms after start, rendering a friendly "Refreshing..." indicator
  if (isPiped) {
    const watchdogMs = rawTimeoutMs - 100;
    setTimeout(() => {
      logger.error('Watchdog timeout - forcing clean exit', { watchdogMs });
      const fallback = dimText('\u27F3 Refreshing...');
      const formatted = formatOutput(fallback, isPiped);
      safeStdoutWrite(formatted);
      process.exit(0);
    }, watchdogMs).unref();
  }

  // Build execution context
  let ctx: ExecutionContext;
  let baseUrl: string;
  try {
    ({ ctx, baseUrl } = await buildExecutionContext(args, isPiped, startTime, rawTimeoutMs));
  } catch (error: unknown) {
    logger.error('Failed to build execution context', { error: String(error) });
    const errorType = error instanceof StatuslineError ? error.errorType : 'network-error';
    const errorOutput = renderError(errorType, 'without-cache');
    const formattedOutput = formatOutput(errorOutput, isPiped);
    safeStdoutWrite(formattedOutput);
    logger.debug('=== cc-api-statusline execution completed ===');
    process.exit(0);
  }

  // Execute cycle
  logger.debug('Execution context prepared', {
    timeoutBudgetMs: ctx.timeoutBudgetMs,
    fetchTimeoutMs: ctx.fetchTimeoutMs
  });
  let result: Awaited<ReturnType<typeof executeCycle>>;
  try {
    result = await executeCycle(ctx);
  } catch (error: unknown) {
    logger.error('Execution cycle failed', { error: String(error) });
    const errorOutput = renderError('network-error', 'without-cache');
    const formattedOutput = formatOutput(errorOutput, isPiped);
    safeStdoutWrite(formattedOutput);
    logger.debug('=== cc-api-statusline execution completed ===');
    process.exit(0);
  }

  const executionTime = Date.now() - startTime;
  logger.debug('Execution completed', {
    exitCode: result.exitCode,
    executionTime: `${executionTime}ms`,
    outputLength: result.output.length,
    cacheUpdate: !!result.cacheUpdate
  });

  // Format and write output
  const formattedOutput = formatOutput(result.output, isPiped);
  safeStdoutWrite(formattedOutput);

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
