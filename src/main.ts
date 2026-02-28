#!/usr/bin/env node
/**
 * cc-api-statusline — Main Entry Point
 *
 * Thin router that delegates to CLI command handlers.
 * Handles args parsing and dispatches to appropriate handler.
 */

import { parseArgs, showHelp, showVersion, handleInstall, handleUninstall, handleApplyConfig, executePipedMode } from './cli/index.js';
import pkg from '../package.json' with { type: 'json' };
import { logger } from './services/logger.js';

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
    process.stdin.on('error', () => {
      // Suppress pipe errors (EPIPE/ECONNRESET when Claude Code closes stdin)
    });
  }
}

/**
 * Main execution (thin router)
 */
async function main(): Promise<void> {
  logger.debug('=== cc-api-statusline execution started ===', { version: pkg.version });

  // Discard stdin
  discardStdin();

  // Parse arguments
  const args = parseArgs();
  logger.debug('Parsed arguments', { args });

  // Route to appropriate handler
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  if (args.install) {
    handleInstall(args);
    return; // handleInstall exits internally
  }

  if (args.uninstall) {
    handleUninstall();
    return; // handleUninstall exits internally
  }

  if (args.applyConfig) {
    handleApplyConfig();
    return; // handleApplyConfig exits internally
  }

  // Interactive TUI mode (future)
  if (process.stdin.isTTY && !args.once) {
    console.log('Interactive configuration mode coming soon.');
    console.log('Use --once for a single fetch, or configure as a Claude Code statusline command.');
    process.exit(0);
  }

  // Execute piped mode or --once mode
  await executePipedMode(args);
}

// Belt-and-suspenders: catch any synchronous throws that bypass main().catch()
// (e.g. unexpected EventEmitter error events on other streams)
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { error: String(error) });
  process.exit(0); // exit 0 — blank statusline is better than [Exit: 1]
});

// Run main and handle unhandled errors
main().catch((error: unknown) => {
  logger.error('Unhandled error in main', { error: String(error) });
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
