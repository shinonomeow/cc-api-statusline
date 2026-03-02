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
import { readCache, writeCache, getCacheDir, isCacheValid, deleteProviderDetectionCache, readDetectionCacheMeta } from '../services/cache.js';
import { loadConfigWithHash } from '../services/config.js';
import { loadEndpointConfigs, computeEndpointConfigHash } from '../services/endpoint-config.js';
import { readEndpointLock, writeEndpointLock } from '../services/endpoint-lock.js';
import { needsConfigInit, writeDefaultConfigs } from '../services/config-defaults.js';
import { resolveProvider, getProvider, invalidateDetectionCache } from '../providers/index.js';
import { cacheProviderDetectionWithTtl } from '../providers/autodetect.js';
import { probeHealthWithMetrics } from '../providers/health-probe.js';
import { renderError } from '../renderer/error.js';
import { dimText } from '../renderer/colors.js';
import { executeCycle } from '../core/index.js';
import { DEFAULT_TIMEOUT_BUDGET_MS, TTY_TIMEOUT_BUDGET_MS, TIMEOUT_HEADROOM_MS, DETECTION_TTL_BASE_S } from '../core/constants.js';
import { selectMaintenanceTask, computeDynamicDetectionTtl } from '../core/maintenance-scheduler.js';
import { logger } from '../services/logger.js';
import { runCacheGC } from '../services/cache-gc.js';

type OutputMode = 'tty' | 'piped' | 'piped-embedded';
type ProviderInstance = NonNullable<ReturnType<typeof getProvider>>;

export type PipedModeDeps = {
  readCurrentEnv: typeof readCurrentEnv;
  validateRequiredEnv: typeof validateRequiredEnv;
  readCache: typeof readCache;
  writeCache: typeof writeCache;
  getCacheDir: typeof getCacheDir;
  isCacheValid: typeof isCacheValid;
  loadConfigWithHash: typeof loadConfigWithHash;
  loadEndpointConfigs: typeof loadEndpointConfigs;
  computeEndpointConfigHash: typeof computeEndpointConfigHash;
  readEndpointLock: typeof readEndpointLock;
  writeEndpointLock: typeof writeEndpointLock;
  needsConfigInit: typeof needsConfigInit;
  writeDefaultConfigs: typeof writeDefaultConfigs;
  resolveProvider: typeof resolveProvider;
  getProvider: typeof getProvider;
  invalidateDetectionCache: typeof invalidateDetectionCache;
  deleteProviderDetectionCache: typeof deleteProviderDetectionCache;
  renderError: typeof renderError;
  dimText: typeof dimText;
  executeCycle: typeof executeCycle;
  logger: typeof logger;
  runCacheGC: typeof runCacheGC;
  probeHealthWithMetrics: typeof probeHealthWithMetrics;
  readDetectionCacheMeta: typeof readDetectionCacheMeta;
  cacheProviderDetectionWithTtl: typeof cacheProviderDetectionWithTtl;
};

const DEFAULT_PIPED_MODE_DEPS: PipedModeDeps = {
  readCurrentEnv,
  validateRequiredEnv,
  readCache,
  writeCache,
  getCacheDir,
  isCacheValid,
  loadConfigWithHash,
  loadEndpointConfigs,
  computeEndpointConfigHash,
  readEndpointLock,
  writeEndpointLock,
  needsConfigInit,
  writeDefaultConfigs,
  resolveProvider,
  getProvider,
  invalidateDetectionCache,
  deleteProviderDetectionCache,
  renderError,
  dimText,
  executeCycle,
  logger,
  runCacheGC,
  probeHealthWithMetrics,
  readDetectionCacheMeta,
  cacheProviderDetectionWithTtl,
};

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

function readAndValidateEnv(deps: PipedModeDeps): { env: EnvSnapshot; baseUrl: string } {
  const env = deps.readCurrentEnv();
  deps.logger.debug('Environment loaded', {
    baseUrl: env.baseUrl ? `${env.baseUrl.substring(0, 30)}...` : undefined,
    hasToken: !!env.authToken,
    providerOverride: env.providerOverride,
    pollIntervalOverride: env.pollIntervalOverride
  });

  const envError = deps.validateRequiredEnv(env);
  if (envError) {
    throw new StatuslineError('missing-env');
  }

  const { baseUrl } = env;
  if (!baseUrl) {
    process.exit(0);
  }

  return { env, baseUrl };
}

function ensureDefaultConfigs(deps: PipedModeDeps): void {
  if (deps.needsConfigInit()) {
    deps.logger.debug('First run detected - initializing default configs');
    deps.writeDefaultConfigs();
  }
}

function loadEndpointConfigsWithHash(deps: PipedModeDeps): { endpointConfigs: EndpointConfigRegistry; endpointConfigHash: string } {
  const endpointConfigs = deps.loadEndpointConfigs();
  const endpointConfigHash = deps.computeEndpointConfigHash();
  deps.logger.debug('Endpoint configs loaded', {
    configCount: Object.keys(endpointConfigs).length,
    endpointConfigHash
  });
  return { endpointConfigs, endpointConfigHash };
}

function resolveEndpointLock(hash: string, deps: PipedModeDeps): EndpointLockEntry {
  const existing = deps.readEndpointLock();
  if (existing) {
    deps.logger.debug('Endpoint lock file loaded', {
      lockedHash: existing.hash,
      currentHash: hash,
      locked: existing.hash === hash
    });
    return existing;
  }
  deps.logger.debug('Endpoint lock file missing - creating with current hash');
  deps.writeEndpointLock(hash);
  return { hash, lockedAt: new Date().toISOString() };
}

async function resolveProviderWithTimeout(
  baseUrl: string,
  env: EnvSnapshot,
  endpointConfigs: EndpointConfigRegistry,
  isPiped: boolean,
  timeoutMs: number,
  deps: PipedModeDeps
): Promise<{ providerId: string; provider: ProviderInstance }> {
  const probeTimeout = isPiped
    ? Math.floor(timeoutMs / 2)
    : timeoutMs;
  const providerId = await deps.resolveProvider(baseUrl, env.providerOverride, endpointConfigs, probeTimeout);
  const provider = deps.getProvider(providerId, endpointConfigs);
  deps.logger.debug('Provider resolved', { providerId, probeTimeout });

  if (!provider) {
    deps.logger.error('Provider not found', { providerId });
    throw new StatuslineError('provider-unknown');
  }

  return { providerId, provider };
}

function computeTimeoutBudgets(isPiped: boolean, config: Config, timeoutMs: number): { timeoutBudgetMs: number; fetchTimeoutMs: number } {
  const timeoutBudgetMs = isPiped ? timeoutMs : TTY_TIMEOUT_BUDGET_MS;
  const fetchTimeoutMs = isPiped
    ? Math.min(config.pipedRequestTimeoutMs ?? DEFAULT_TIMEOUT_BUDGET_MS, timeoutBudgetMs - TIMEOUT_HEADROOM_MS)
    : TTY_TIMEOUT_BUDGET_MS;
  return { timeoutBudgetMs, fetchTimeoutMs };
}

/**
 * Build execution context from arguments and environment
 */
async function buildExecutionContext(
  args: ParsedArgs,
  isPiped: boolean,
  startTime: number,
  rawTimeoutMs: number,
  deps: PipedModeDeps
): Promise<{ ctx: ExecutionContext; baseUrl: string; endpointConfigs: EndpointConfigRegistry }> {
  const { env, baseUrl } = readAndValidateEnv(deps);
  ensureDefaultConfigs(deps);
  const { config, configHash } = deps.loadConfigWithHash(args.configPath);
  const { endpointConfigs, endpointConfigHash } = loadEndpointConfigsWithHash(deps);
  const endpointLock = resolveEndpointLock(endpointConfigHash, deps);

  // Cache-first: read cache before probing provider — saves up to 800ms on warm cache
  const cachedEntry = deps.readCache(baseUrl);
  deps.logger.debug('Cache read', {
    cacheHit: !!cachedEntry,
    cacheAge: cachedEntry ? `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s` : 'N/A'
  });

  let providerId: string;
  let provider: ProviderInstance;

  if (cachedEntry && deps.isCacheValid(cachedEntry, env)) {
    const cachedProvider = deps.getProvider(cachedEntry.provider, endpointConfigs);
    if (cachedProvider) {
      // Fast path: cache is valid and provider is known — skip the health probe
      providerId = cachedEntry.provider;
      provider = cachedProvider;
      deps.logger.debug('Cache-first: skipping provider probe', { providerId });
    } else {
      ({ providerId, provider } = await resolveProviderWithTimeout(baseUrl, env, endpointConfigs, isPiped, rawTimeoutMs, deps));
    }
  } else {
    ({ providerId, provider } = await resolveProviderWithTimeout(baseUrl, env, endpointConfigs, isPiped, rawTimeoutMs, deps));
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

  return { ctx, baseUrl, endpointConfigs };
}

/**
 * Format output based on the current output mode.
 *
 * 'piped'          — prepend \x1b[0m reset + replace spaces with NBSP
 * 'piped-embedded' — no host formatting (avoids breaking powerline colors)
 * 'tty'            — append newline for interactive display
 */
function formatOutput(output: string, mode: OutputMode, log: PipedModeDeps['logger']): string {
  let normalizedOutput = output;

  // Guard against empty output
  if (!normalizedOutput || normalizedOutput.trim().length === 0) {
    log.debug('Empty output detected, using fallback');
    normalizedOutput = '[loading...]';
  }

  switch (mode) {
    case 'piped-embedded':
      log.debug('Output written (embedded piped mode - no host formatting)');
      return normalizedOutput;
    case 'piped':
      log.debug('Output formatted for piped mode (ANSI reset + NBSP)');
      return '\x1b[0m' + normalizedOutput.replace(/ /g, '\u00A0');
    case 'tty':
      log.debug('Output written (TTY mode)');
      return normalizedOutput + '\n';
  }
}

/**
 * Run one scheduled maintenance task after user output is delivered
 *
 * Only runs on Path A/B cycles (fast paths with remaining time budget).
 * Selects at most one task: health-probe > cache-gc > none.
 * Health probe result updates detection cache with dynamic TTL.
 */
async function runMaintenance(
  result: Awaited<ReturnType<typeof executeCycle>>,
  baseUrl: string,
  startTime: number,
  budgetMs: number,
  endpointConfigs: EndpointConfigRegistry,
  currentProviderId: string,
  deps: PipedModeDeps
): Promise<void> {
  const { ageMs, ttlMs } = deps.readDetectionCacheMeta(baseUrl);
  const task = selectMaintenanceTask({
    path: result.path,
    detectionCacheAgeMs: ageMs,
    detectionCacheTtlMs: ttlMs,
  });

  if (task === 'none') return;
  deps.logger.debug('Maintenance task selected', { task, path: result.path });

  if (task === 'health-probe') {
    // Reserve TIMEOUT_HEADROOM_MS buffer; use whatever time remains
    const elapsed = Date.now() - startTime;
    const remainingMs = Math.max(50, budgetMs - elapsed - TIMEOUT_HEADROOM_MS);
    const currentTtlS = Math.floor(ttlMs / 1000) || DETECTION_TTL_BASE_S;
    const outcome = await deps.probeHealthWithMetrics(baseUrl, remainingMs, endpointConfigs);
    deps.logger.debug('Maintenance probe completed', {
      success: outcome.success,
      matchedProvider: outcome.matchedProvider,
      responseTimeMs: outcome.responseTimeMs,
    });
    if (outcome.success && outcome.matchedProvider) {
      const newTtlS = computeDynamicDetectionTtl(outcome, currentProviderId, currentTtlS);
      deps.cacheProviderDetectionWithTtl(baseUrl, outcome.matchedProvider, newTtlS);
      deps.logger.debug('Detection cache refreshed', { ttlSeconds: newTtlS, provider: outcome.matchedProvider });
    }
  } else if (task === 'cache-gc') {
    deps.runCacheGC(deps.getCacheDir());
    deps.logger.debug('Cache GC completed');
  }
}

/**
 * Execute piped mode (or --once mode)
 */
export async function executePipedMode(args: ParsedArgs, deps: PipedModeDeps = DEFAULT_PIPED_MODE_DEPS): Promise<void> {
  // Record start time for deadline tracking
  const startTime = Date.now();

  deps.logger.debug('=== cc-api-statusline execution started ===');
  deps.logger.debug('Start time', { startTime });

  // Detect mode: piped (stdin not TTY) or TTY
  // args.embedded already incorporates the CC_API_STATUSLINE_EMBEDDED env var (resolved in parseArgs)
  const isPiped = !process.stdin.isTTY;
  const outputMode: OutputMode = !isPiped ? 'tty' : args.embedded ? 'piped-embedded' : 'piped';
  deps.logger.debug('Mode detection', { isPiped, once: args.once, outputMode });

  // Read timeout early — needed for both watchdog and buildExecutionContext
  const rawTimeoutMs = Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? DEFAULT_TIMEOUT_BUDGET_MS);

  // Watchdog timer: exit cleanly before Claude Code's SIGKILL deadline
  // Fires rawTimeoutMs-100ms after start, rendering a friendly "Refreshing..." indicator
  if (isPiped) {
    const watchdogMs = rawTimeoutMs - TIMEOUT_HEADROOM_MS;
    setTimeout(() => {
      deps.logger.error('Watchdog timeout - forcing clean exit', { watchdogMs });
      const fallback = deps.dimText('\u27F3 Refreshing...');
      const formatted = formatOutput(fallback, outputMode, deps.logger);
      safeStdoutWrite(formatted);
      process.exit(0);
    }, watchdogMs).unref();
  }

  // Build execution context
  let ctx: ExecutionContext;
  let baseUrl: string;
  let endpointConfigs: EndpointConfigRegistry;
  try {
    ({ ctx, baseUrl, endpointConfigs } = await buildExecutionContext(args, isPiped, startTime, rawTimeoutMs, deps));
  } catch (error: unknown) {
    deps.logger.error('Failed to build execution context', { error: String(error) });
    const errorType = error instanceof StatuslineError ? error.errorType : 'network-error';
    const errorOutput = deps.renderError(errorType, 'without-cache');
    const formattedOutput = formatOutput(errorOutput, outputMode, deps.logger);
    safeStdoutWrite(formattedOutput);
    deps.logger.debug('=== cc-api-statusline execution completed ===');
    process.exit(0);
  }

  // Execute cycle
  deps.logger.debug('Execution context prepared', {
    timeoutBudgetMs: ctx.timeoutBudgetMs,
    fetchTimeoutMs: ctx.fetchTimeoutMs
  });
  let result: Awaited<ReturnType<typeof executeCycle>>;
  try {
    result = await deps.executeCycle(ctx);
  } catch (error: unknown) {
    deps.logger.error('Execution cycle failed', { error: String(error) });
    const errorOutput = deps.renderError('network-error', 'without-cache');
    const formattedOutput = formatOutput(errorOutput, outputMode, deps.logger);
    safeStdoutWrite(formattedOutput);
    deps.logger.debug('=== cc-api-statusline execution completed ===');
    process.exit(0);
  }

  const executionTime = Date.now() - startTime;
  deps.logger.debug('Execution completed', {
    exitCode: result.exitCode,
    executionTime: `${executionTime}ms`,
    outputLength: result.output.length,
    cacheUpdate: !!result.cacheUpdate
  });

  // Format and write output
  const formattedOutput = formatOutput(result.output, outputMode, deps.logger);
  safeStdoutWrite(formattedOutput);

  // Invalidate provider detection cache on provider-mismatch errors
  if (result.invalidateProvider) {
    deps.invalidateDetectionCache(baseUrl);       // in-memory
    deps.deleteProviderDetectionCache(baseUrl);   // disk
    deps.logger.debug('Provider detection cache invalidated', { baseUrl });
  }

  // Write cache update if present
  if (result.cacheUpdate) {
    deps.writeCache(baseUrl, result.cacheUpdate);
    deps.logger.debug('Cache written', { baseUrl });
  }

  // Run scheduled maintenance after output is delivered (Path A/B only)
  await runMaintenance(result, baseUrl, startTime, rawTimeoutMs, endpointConfigs, ctx.providerId, deps);

  deps.logger.debug('=== cc-api-statusline execution completed ===');

  process.exit(result.exitCode);
}
