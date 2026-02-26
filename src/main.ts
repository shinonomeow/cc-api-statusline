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

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  help: boolean;
  version: boolean;
  once: boolean;
  configPath?: string;
} {
  const args = process.argv.slice(2);
  let help = false;
  let version = false;
  let once = false;
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--once') {
      once = true;
    } else if (arg === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++; // Skip next arg
    }
  }

  return { help, version, once, configPath };
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

Environment Variables:
  ANTHROPIC_BASE_URL       API endpoint (required)
  ANTHROPIC_AUTH_TOKEN     API key (required)
  CC_STATUSLINE_PROVIDER   Override provider detection
  CC_STATUSLINE_POLL       Override poll interval (seconds)
  CC_STATUSLINE_TIMEOUT    Piped mode timeout (milliseconds, default 1000)

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
  // TODO: Read from package.json
  console.log('cc-api-statusline v0.1.0');
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

  // Discard stdin
  discardStdin();

  // Parse arguments
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Detect mode: piped (stdin not TTY) or TTY
  const isPiped = !process.stdin.isTTY;

  // Interactive TUI mode (future)
  if (!isPiped && !args.once) {
    // Future: launch TUI settings/config interface (like ccstatusline's interactive mode)
    console.log('Interactive configuration mode coming soon.');
    console.log('Use --once for a single fetch, or configure as a Claude Code statusline command.');
    process.exit(0);
  }

  // Read current environment
  const env = readCurrentEnv();

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

  // Resolve provider
  const providerId = resolveProvider(
    baseUrl,
    env.providerOverride,
    config.customProviders ?? {}
  );
  const provider = getProvider(providerId, config.customProviders ?? {});

  if (!provider) {
    const errorOutput = renderError('provider-unknown', 'without-cache');
    process.stdout.write(errorOutput);
    process.exit(1);
  }

  // Read cache
  const cachedEntry = readCache(baseUrl);

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
  const result = await executeCycle(ctx);

  // Apply side effects
  process.stdout.write(result.output);

  if (result.cacheUpdate) {
    writeCache(baseUrl, result.cacheUpdate);
  }

  process.exit(result.exitCode);
}

// Run main
main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
