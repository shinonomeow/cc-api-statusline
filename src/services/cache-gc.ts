/**
 * Cache Garbage Collection
 *
 * Automatically cleans up old and orphaned cache files.
 */

import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { GC_MAX_AGE_MS, GC_MAX_CACHE_FILES, GC_ORPHAN_TMP_AGE_MS } from '../core/constants.js';
import { logger } from './logger.js';

/**
 * Run garbage collection on cache directory
 *
 * Deletes:
 * 1. cache-*.json files older than 7 days
 * 2. provider-detect-*.json files older than 7 days
 * 3. *.tmp files older than 1 hour
 * 4. Oldest cache-*.json files if count exceeds 20
 *
 * Preserves:
 * - config.json
 * - debug.log
 * - Any other files not matching the patterns
 *
 * @param cacheDir - Path to cache directory
 */
export function runCacheGC(cacheDir: string): void {
  try {
    // Check if directory exists
    if (!existsSync(cacheDir)) {
      logger.debug('GC: Cache directory does not exist, skipping', { cacheDir });
      return;
    }

    logger.debug('GC: Starting garbage collection', { cacheDir });

    // Read all files
    const files = readdirSync(cacheDir);

    // Categorize files
    const cacheFiles: Array<{ name: string; mtime: number }> = [];
    const providerDetectFiles: Array<{ name: string; mtime: number }> = [];
    const tmpFiles: Array<{ name: string; mtime: number }> = [];

    for (const file of files) {
      try {
        const filePath = join(cacheDir, file);
        const stats = statSync(filePath);
        const mtime = stats.mtimeMs;

        if (file.startsWith('cache-') && file.endsWith('.json')) {
          cacheFiles.push({ name: file, mtime });
        } else if (file.startsWith('provider-detect-') && file.endsWith('.json')) {
          providerDetectFiles.push({ name: file, mtime });
        } else if (file.endsWith('.tmp')) {
          tmpFiles.push({ name: file, mtime });
        }
      } catch (error) {
        logger.debug('GC: Failed to stat file, skipping', { file, error: String(error) });
      }
    }

    const now = Date.now();
    let deletedCount = 0;

    // Delete old cache files (> 7 days)
    for (const file of cacheFiles) {
      const age = now - file.mtime;
      if (age > GC_MAX_AGE_MS) {
        try {
          unlinkSync(join(cacheDir, file.name));
          deletedCount++;
          logger.debug('GC: Deleted old cache file', { file: file.name, ageDays: Math.floor(age / (24 * 60 * 60 * 1000)) });
        } catch (error) {
          logger.debug('GC: Failed to delete cache file', { file: file.name, error: String(error) });
        }
      }
    }

    // Delete old provider-detect files (> 7 days)
    for (const file of providerDetectFiles) {
      const age = now - file.mtime;
      if (age > GC_MAX_AGE_MS) {
        try {
          unlinkSync(join(cacheDir, file.name));
          deletedCount++;
          logger.debug('GC: Deleted old provider-detect file', { file: file.name, ageDays: Math.floor(age / (24 * 60 * 60 * 1000)) });
        } catch (error) {
          logger.debug('GC: Failed to delete provider-detect file', { file: file.name, error: String(error) });
        }
      }
    }

    // Delete orphaned .tmp files (> 1 hour)
    for (const file of tmpFiles) {
      const age = now - file.mtime;
      if (age > GC_ORPHAN_TMP_AGE_MS) {
        try {
          unlinkSync(join(cacheDir, file.name));
          deletedCount++;
          logger.debug('GC: Deleted orphaned tmp file', { file: file.name, ageMinutes: Math.floor(age / (60 * 1000)) });
        } catch (error) {
          logger.debug('GC: Failed to delete tmp file', { file: file.name, error: String(error) });
        }
      }
    }

    // Count-based cleanup: keep only most recent cache files
    const remainingCacheFiles = cacheFiles.filter(file => {
      const age = now - file.mtime;
      return age <= GC_MAX_AGE_MS; // Only count files not already deleted
    });

    if (remainingCacheFiles.length > GC_MAX_CACHE_FILES) {
      // Sort by mtime ascending (oldest first)
      remainingCacheFiles.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files
      const toDelete = remainingCacheFiles.slice(0, remainingCacheFiles.length - GC_MAX_CACHE_FILES);
      for (const file of toDelete) {
        try {
          unlinkSync(join(cacheDir, file.name));
          deletedCount++;
          logger.debug('GC: Deleted cache file (count limit)', { file: file.name });
        } catch (error) {
          logger.debug('GC: Failed to delete cache file', { file: file.name, error: String(error) });
        }
      }
    }

    logger.debug('GC: Garbage collection completed', { deletedCount });
  } catch (error) {
    // Never throw - GC is best-effort
    logger.debug('GC: Garbage collection failed', { error: String(error) });
  }
}
