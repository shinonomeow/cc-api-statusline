/**
 * CLI Argument Parsing
 *
 * Parses command-line arguments and provides help/version display.
 */

import pkg from '../../package.json' with { type: 'json' };

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  once: boolean;
  install: boolean;
  uninstall: boolean;
  force: boolean;
  configPath?: string;
  runner?: 'npx' | 'bunx';
}

/**
 * Parse command-line arguments
 */
export function parseArgs(): ParsedArgs {
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
export function showHelp(): void {
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
  https://github.com/liafonx/cc-api-statusline
  `.trim());
}

/**
 * Show version
 */
export function showVersion(): void {
  console.log(`cc-api-statusline v${pkg.version}`);
}
