/**
 * CLI Command Handlers
 *
 * Handlers for --install and --uninstall commands.
 */

import type { ParsedArgs } from './args.js';
import {
  installStatusLine,
  uninstallStatusLine,
  getExistingStatusLine,
  isBunxAvailable,
} from '../services/settings.js';

/**
 * Handle --install command
 */
export function handleInstall(args: ParsedArgs): void {
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

/**
 * Handle --uninstall command
 */
export function handleUninstall(): void {
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
