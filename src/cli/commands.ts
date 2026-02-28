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
import { writeDefaultConfigs } from '../services/config-defaults.js';
import { computeEndpointConfigHash, getEndpointConfigDir } from '../services/endpoint-config.js';
import { writeEndpointLock } from '../services/endpoint-lock.js';
import { clearDetectionCache } from '../providers/autodetect.js';
import { getCacheDir } from '../services/cache.js';
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

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

  // Create default config files
  console.log('Creating default configuration files...');
  writeDefaultConfigs();
  console.log('✓ Config files created:');
  console.log('  - ~/.claude/cc-api-statusline/config.json');
  console.log('  - ~/.claude/cc-api-statusline/api-config/sub2api.json');
  console.log('  - ~/.claude/cc-api-statusline/api-config/crs.json');
  console.log('  - ~/.claude/cc-api-statusline/.endpoint-config.lock');

  // Install statusline widget
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

/**
 * Handle --apply-config command
 *
 * Updates the endpoint config lock file and clears caches.
 * This allows endpoint config changes to take effect.
 */
export function handleApplyConfig(): void {
  console.log('Applying endpoint configuration changes...');

  // Compute current endpoint config hash
  const currentHash = computeEndpointConfigHash();
  console.log(`Current endpoint config hash: ${currentHash}`);

  // Clear provider detection cache
  clearDetectionCache();
  console.log('✓ Provider detection cache cleared');

  // Clear data caches
  const cacheDir = getCacheDir();
  let failCount = 0;
  if (existsSync(cacheDir)) {
    const files = readdirSync(cacheDir).filter(f => f.startsWith('cache-') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const filePath = join(cacheDir, file);
        unlinkSync(filePath);
      } catch {
        failCount++;
      }
    }
    if (failCount > 0) {
      console.log(`⚠ Cleared ${files.length - failCount}/${files.length} cache files (${failCount} failed)`);
    } else {
      console.log(`✓ Cleared ${files.length} data cache file(s)`);
    }
  }

  // Update lock file AFTER cache clearing (so partial failure keeps system in warning state)
  writeEndpointLock(currentHash);
  console.log('✓ Lock file updated');

  console.log('');
  console.log('✓ Endpoint config changes applied successfully!');
  console.log('  Changes will take effect on next statusline refresh.');
  console.log('');
  console.log('Config files:');
  const apiConfigDir = getEndpointConfigDir();
  if (existsSync(apiConfigDir)) {
    const configFiles = readdirSync(apiConfigDir).filter(f => f.endsWith('.json'));
    for (const file of configFiles) {
      console.log(`  - ${apiConfigDir}/${file}`);
    }
  }

  process.exit(0);
}
