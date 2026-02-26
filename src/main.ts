#!/usr/bin/env node
/**
 * cc-api-statusline — Main Entry Point
 *
 * Thin orchestrator that delegates to core execution logic.
 * Handles CLI args, mode detection, and applies side effects.
 */

import { readCurrentEnv, validateRequiredEnv } from './services/env.js';
import { readCache, writeCache, computeConfigHash } from './services/cache.js';
import { loadConfig, getConfigPath } from './services/config.js';
import { resolveProvider, getProvider } from './providers/index.js';
import { renderError } from './renderer/error.js';
import { executeCycle } from './core/index.js';
import type { ExecutionContext } from './core/index.js';
import {
  installStatusLine,
  uninstallStatusLine,
  getExistingStatusLine,
  isBunxAvailable,
} from './services/settings.js';
import { logger } from './services/logger.js';
import pkg from '../package.json' with { type: 'json' };

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  help: boolean;
  version: boolean;
  once: boolean;
  install: boolean;
  uninstall: boolean;
  force: boolean;
  configPath?: string;
  runner?: 'npx' | 'bunx';
} {
  const args = process.argv.slice(2);
  let help = false;
  let version = false;
  let once = false;
  let install = false;
  let uninstall = false;
  let force = false;
  let configPath: string | undefined;
  let runner: 'npx' | 'bunx' | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--once') {
      once = true;
    } else if (arg === '--install') {
      install = true;
    } else if (arg === '--uninstall') {
      uninstall = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--runner' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg === 'npx' || nextArg === 'bunx') {
        runner = nextArg;
      }
      i++; // Skip next arg
    }
  }

  return { help, version, once, install, uninstall, force, configPath, runner };
}

/**
 * Show help text
 */
function showHelp(): void {
  console.log(`
cc-api-statusline — Claude API statusline widget

Usage:
  cc-api-statusline [options]

Options:
  --help, -h         Show this help message
  --version, -v      Show version
  --once             Fetch once and exit (no polling)
  --config <path>    Use custom config file
  --install          Register as Claude Code statusline widget
  --uninstall        Remove statusline widget registration
  --runner <runner>  Package runner: npx or bunx (default: auto-detect)
  --force            Force overwrite existing statusline configuration

Environment Variables:
  ANTHROPIC_BASE_URL       API endpoint (required)
  ANTHROPIC_AUTH_TOKEN     API key (required)
  CC_STATUSLINE_PROVIDER   Override provider detection
  CC_STATUSLINE_POLL       Override poll interval (seconds)
  CC_STATUSLINE_TIMEOUT    Piped mode timeout (milliseconds, default 1000)
  DEBUG or CC_STATUSLINE_DEBUG  Enable debug logging to ~/.claude/cc-api-statusline/debug.log

Config File:
  ~/.claude/cc-api-statusline/config.json

Documentation:
  https://github.com/anthropics/cc-api-statusline
  `.trim());
}

/**
 * Show version
 */
function showVersion(): void {
  console.log(`cc-api-statusline v${pkg.version}`);
}

/**
 * Discard stdin without blocking
 *
 * ccstatusline pipes JSON to stdin, but we don't use it (we use env vars instead).
 * Read and discard to prevent blocking.
 */
function discardStdin(): void {
  if (!process.stdin.isTTY) {
    process.stdin.resume();
    process.stdin.on('data', () => {
      // Discard data
    });
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  // Record start time for deadline tracking
  const startTime = Date.now();

  logger.debug('=== cc-api-statusline execution started ===');
  logger.debug('Start time', { startTime, version: pkg.version });

  // Discard stdin
  discardStdin();

  // Parse arguments
  const args = parseArgs();
  logger.debug('Parsed arguments', { args });

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Handle --install flag
  if (args.install) {
    const existing = getExistingStatusLine();

    if (existing && !args.force) {
      console.error('Error: statusLine is already configured in settings.json');
      console.error(`Current command: ${existing}`);
      console.error('Use --force to overwrite, or --uninstall to remove first.');
      process.exit(1);
    }

    // Auto-detect runner if not specified
    const runner: 'npx' | 'bunx' = args.runner ?? (isBunxAvailable() ? 'bunx' : 'npx');

    installStatusLine(runner);

    console.log('✓ Statusline installed successfully!');
    console.log(`  Runner: ${runner}`);
    console.log(`  Command: ${runner} -y cc-api-statusline@latest`);
    console.log(`  Config: ~/.claude/settings.json`);
    process.exit(0);
  }

  // Handle --uninstall flag
  if (args.uninstall) {
    const existing = getExistingStatusLine();

    if (!existing) {
      console.log('No statusLine configuration found in settings.json');
      process.exit(0);
    }

    uninstallStatusLine();

    console.log('✓ Statusline uninstalled successfully');
    console.log('  Removed statusLine from ~/.claude/settings.json');
    process.exit(0);
  }

  // Detect mode: piped (stdin not TTY) or TTY
  const isPiped = !process.stdin.isTTY;
  logger.debug('Mode detection', { isPiped, once: args.once });

  // Interactive TUI mode (future)
  if (!isPiped && !args.once) {
    // Future: launch TUI settings/config interface (like ccstatusline's interactive mode)
    console.log('Interactive configuration mode coming soon.');
    console.log('Use --once for a single fetch, or configure as a Claude Code statusline command.');
    process.exit(0);
  }

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
    process.exit(1);
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

  // Resolve provider
  const providerId = resolveProvider(
    baseUrl,
    env.providerOverride,
    config.customProviders ?? {}
  );
  const provider = getProvider(providerId, config.customProviders ?? {});
  logger.debug('Provider resolved', { providerId });

  if (!provider) {
    logger.error('Provider not found', { providerId });
    const errorOutput = renderError('provider-unknown', 'without-cache');
    process.stdout.write(errorOutput);
    process.exit(1);
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

  // Execute cycle
  logger.debug('Execution context prepared', { timeoutBudgetMs, fetchTimeoutMs });
  const result = await executeCycle(ctx);

  const executionTime = Date.now() - startTime;
  logger.debug('Execution completed', {
    exitCode: result.exitCode,
    executionTime: `${executionTime}ms`,
    outputLength: result.output.length,
    cacheUpdate: !!result.cacheUpdate
  });

  // Apply side effects
  // In piped mode (Claude Code widget), apply host-specific formatting:
  // 1. Prepend \x1b[0m to reset Claude Code's dim styling
  // 2. Replace spaces with NBSP (\u00A0) to prevent VSCode trimming
  if (isPiped) {
    const formatted = '\x1b[0m' + result.output.replace(/ /g, '\u00A0');
    process.stdout.write(formatted);
    logger.debug('Output formatted for piped mode (ANSI reset + NBSP)');
  } else {
    process.stdout.write(result.output);
    logger.debug('Output written (TTY mode)');
  }

  if (result.cacheUpdate) {
    writeCache(baseUrl, result.cacheUpdate);
    logger.debug('Cache updated');
  }

  logger.debug('=== Execution finished ===', { exitCode: result.exitCode });
  process.exit(result.exitCode);
}

// Run main
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
