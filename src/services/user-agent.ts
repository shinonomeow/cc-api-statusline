import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from './logger';

/**
 * Fallback User-Agent when auto-detection fails
 */
const FALLBACK_UA = 'claude-cli/2.1.56 (external, cli)';

/**
 * Resolve User-Agent based on config value
 *
 * @param config - Config value (false/undefined/true/string)
 * @returns Resolved User-Agent string or null if no spoofing
 */
export function resolveUserAgent(
  config: boolean | string | undefined
): string | null {
  // No spoofing
  if (!config) {
    return null;
  }

  // Custom UA provided
  if (typeof config === 'string') {
    // Treat empty string as null
    return config || null;
  }

  // Auto-detect (config === true)
  return detectClaudeCodeUA();
}

/**
 * Detect Claude Code User-Agent with fallback
 *
 * @returns Claude Code UA string (detected or fallback)
 */
function detectClaudeCodeUA(): string {
  logger.debug('UA spoofing enabled, attempting detection');

  const version = detectClaudeVersion();
  if (version) {
    const ua = `claude-cli/${version} (external, cli)`;
    logger.debug(`Detected Claude Code version: ${version}`);
    return ua;
  }

  logger.debug(`Detection failed, using fallback: ${FALLBACK_UA}`);
  return FALLBACK_UA;
}

/**
 * Detect Claude Code version from CLI
 *
 * @returns Version string (e.g., "2.1.56") or null if detection fails
 */
export function detectClaudeVersion(): string | null {
  try {
    // Only try detection when running under Claude Code
    if (!process.env['CLAUDECODE']) {
      return null;
    }

    // Try to execute: ~/.claude/bin/claude --version
    const claudePath = join(homedir(), '.claude', 'bin', 'claude');
    const result = execSync(`"${claudePath}" --version`, {
      encoding: 'utf-8',
      timeout: 100,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Parse version from output (e.g., "claude-cli/2.1.56" or "2.1.56")
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    // Detection failed, return null to trigger fallback
    return null;
  }
}
