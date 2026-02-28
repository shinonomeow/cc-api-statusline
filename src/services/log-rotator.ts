/**
 * Log rotation service
 *
 * Probabilistically rotates debug.log on 1/20 invocations:
 *   size >= 500 KB (age < 24h) → rename to .log (plain, readable)
 *   age >= 24h                 → rename to .log + gzip (detached child)
 *
 * Cleanup pass: gzip .log archives > 24h, delete .log.gz archives > 3 days.
 */

import { statSync, renameSync, readdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import {
  LOG_ROTATION_PROBABILITY,
  LOG_MAX_SIZE_BYTES,
  LOG_MAX_AGE_MS,
  LOG_RETENTION_MS,
} from '../core/constants.js';

const ARCHIVE_LOG_RE = /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/;
const ARCHIVE_GZ_RE = /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log\.gz$/;

export function archiveName(logPath: string, now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  return join(dirname(logPath), `debug.${y}-${mo}-${d}T${h}-${min}.log`);
}

function spawnGzip(filePath: string): void {
  try {
    const child = spawn('gzip', ['-f', filePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Silent — gzip unavailable or spawn failed
  }
}

function runCleanup(logDir: string, excludePath: string | null): void {
  try {
    const files = readdirSync(logDir);
    const now = Date.now();

    for (const name of files) {
      const filePath = join(logDir, name);
      if (filePath === excludePath) continue; // skip just-rotated file

      if (ARCHIVE_LOG_RE.test(name)) {
        const s = statSync(filePath, { throwIfNoEntry: false });
        if (s && now - s.mtimeMs >= LOG_MAX_AGE_MS) {
          spawnGzip(filePath);
        }
        continue;
      }

      if (ARCHIVE_GZ_RE.test(name)) {
        const s = statSync(filePath, { throwIfNoEntry: false });
        if (s && now - s.mtimeMs >= LOG_RETENTION_MS) {
          try { unlinkSync(filePath); } catch { /* silent */ }
        }
      }
    }
  } catch {
    // Silent — never break statusline execution
  }
}

export function maybeRotateLogs(logPath: string): void {
  if (Math.random() > LOG_ROTATION_PROBABILITY) return;

  const logDir = dirname(logPath);
  const stat = statSync(logPath, { throwIfNoEntry: false });
  let rotatedArchive: string | null = null;

  if (stat) {
    const age = Date.now() - stat.mtimeMs;
    const archive = archiveName(logPath);

    try {
      if (age >= LOG_MAX_AGE_MS) {
        renameSync(logPath, archive);
        spawnGzip(archive);
        rotatedArchive = archive;
      } else if (stat.size >= LOG_MAX_SIZE_BYTES) {
        renameSync(logPath, archive);
        rotatedArchive = archive;
      }
    } catch {
      // Silent — never break statusline execution
    }
  }

  runCleanup(logDir, rotatedArchive);
}
