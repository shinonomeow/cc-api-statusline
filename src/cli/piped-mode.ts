/**
 * Piped Mode Execution
 *
 * Handles piped mode (Claude Code widget) and --once mode execution.
 * Builds execution context, runs cycle, and formats output.
 */

import type { ParsedArgs } from './args.js';
import type { ExecutionContext } from '../core/index.js';
import { readCurrentEnv, validateRequiredEnv } from '../services/env.js';
import { readCache, writeCache, computeConfigHash } from '../services/cache.js';
import { loadConfig, getConfigPath } from '../services/config.js';
import { resolveProvider, getProvider } from '../providers/index.js';
import { renderError } from '../renderer/error.js';
import { executeCycle } from '../core/index.js';
import { logger } from '../services/logger.js';

/**
 * Build execution context from arguments and environment
 */
function buildExecutionContext(
  args: ParsedArgs,
  isPiped: boolean,
  startTime: number
): Promise<{
  ctx: ExecutionContext;
  baseUrl: string;
}> {
  return (async () => {
    // Read current environment
    const env = readCurrentEnv();
    logger.debug('Environment loaded', {
      baseUrl: env.baseUrl ? `${env.baseUrl.substring(0, 30)}...` : undefined,
      hasToken: !!env.authToken,
      providerOverride: env.providerOverride,
      pollIntervalOverride: env.pollIntervalOverride
    });

    // Validate required env vars
    const envError = validateRequiredEnv(env);
    if (envError) {
      const errorOutput = renderError('missing-env', 'without-cache');
      process.stdout.write(errorOutput);
      process.exit(0);
    }

    const baseUrl = env.baseUrl;
    const authToken = env.authToken;

    if (!baseUrl || !authToken) {
      // Should never happen after validation, but satisfy TypeScript
      process.exit(1);
    }

    // Load config
    const config = loadConfig(args.configPath);
    const configPath = getConfigPath(args.configPath);
    const configHash = computeConfigHash(configPath);
    logger.debug('Config loaded', { configPath, configHash });

    // Resolve provider (with mode-aware probe timeout)
    // In piped mode, cap probe timeout to budget - 200ms overhead
    // In --once mode, allow longer probe timeout (3s)
    const probeTimeout = isPiped
      ? Math.min(1500, Math.max(200, Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? 1000) - 200))
      : 3000;
    const providerId = await resolveProvider(
      baseUrl,
      env.providerOverride,
      config.customProviders ?? {},
      probeTimeout
    );
    const provider = getProvider(providerId, config.customProviders ?? {});
    logger.debug('Provider resolved', { providerId, probeTimeout });

    if (!provider) {
      logger.error('Provider not found', { providerId });
      const errorOutput = renderError('provider-unknown', 'without-cache');
      process.stdout.write(errorOutput);
      process.exit(0);
    }

    // Read cache
    const cachedEntry = readCache(baseUrl);
    logger.debug('Cache read', {
      cacheHit: !!cachedEntry,
      cacheAge: cachedEntry ? `${Math.floor((Date.now() - new Date(cachedEntry.fetchedAt).getTime()) / 1000)}s` : 'N/A'
    });

    // Derive timeout budgets
    const timeoutBudgetMs = isPiped
      ? Number(process.env['CC_STATUSLINE_TIMEOUT'] ?? 1000)
      : 10000; // 10s for direct mode

    const fetchTimeoutMs = isPiped
      ? Math.min(config.pipedRequestTimeoutMs ?? 800, timeoutBudgetMs - 100)
      : 10000;

    // Construct execution context
    const ctx: ExecutionContext = {
      env,
      config,
      configHash,
      cachedEntry,
      providerId,
      provider,
      timeoutBudgetMs,
      startTime,
      fetchTimeoutMs,
    };

    return { ctx, baseUrl };
  })();
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
  const { ctx, baseUrl } = await buildExecutionContext(args, isPiped, startTime);

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
  }

  logger.debug('=== cc-api-statusline execution completed ===');

  process.exit(result.exitCode);
}
