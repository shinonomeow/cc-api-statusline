/**
 * Debug logger service
 *
 * Writes debug logs to ~/.claude/cc-api-statusline/debug.log when enabled.
 * Enable with: DEBUG=1 or CC_STATUSLINE_DEBUG=1
 */

import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ensureDir } from './ensure-dir.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private enabled: boolean;
  private logPath: string;

  constructor() {
    // Check if debug mode is enabled
    this.enabled = !!(
      process.env['DEBUG'] ||
      process.env['CC_STATUSLINE_DEBUG']
    );

    // Set log path
    const logDir = process.env['CC_API_STATUSLINE_LOG_DIR'] ||
      join(homedir(), '.claude', 'cc-api-statusline');
    this.logPath = join(logDir, 'debug.log');

    if (this.enabled) {
      this.ensureLogDir();
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    try {
      const dir = dirname(this.logPath);
      ensureDir(dir);
    } catch {
      // Silent failure - don't break execution if we can't create log dir
      this.enabled = false;
    }
  }

  /**
   * Format local timestamp (YYYY-MM-DD HH:MM:SS.mmm)
   */
  private formatLocalTimestamp(): string {
    const d = new Date();
    const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  /**
   * Format log entry with timestamp and level
   */
  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = this.formatLocalTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;
  }

  /**
   * Write log entry to file
   */
  private write(level: LogLevel, message: string, data?: unknown): void {
    if (!this.enabled) {
      return;
    }

    try {
      const entry = this.format(level, message, data);
      appendFileSync(this.logPath, entry, { encoding: 'utf-8' });
    } catch {
      // Silent failure - don't break execution if logging fails
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: unknown): void {
    this.write('debug', message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: unknown): void {
    this.write('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: unknown): void {
    this.write('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, data?: unknown): void {
    this.write('error', message, data);
  }

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get log file path
   */
  getLogPath(): string {
    return this.logPath;
  }
}

// Export singleton instance
export const logger = new Logger();
