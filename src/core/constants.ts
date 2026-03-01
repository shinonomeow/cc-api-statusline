/**
 * Core constants shared across modules
 *
 * Centralizes hardcoded values for maintainability.
 */

/**
 * Default fetch timeout in milliseconds
 * Used by all providers when no custom timeout provided
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 5000;

/**
 * Exit buffer in milliseconds
 * Reserves time to write output before timeout deadline
 */
export const EXIT_BUFFER_MS = 50;

/**
 * Staleness threshold in minutes
 * Cache age >= 5min shows staleness indicator
 */
export const STALENESS_THRESHOLD_MINUTES = 5;

/**
 * Very stale threshold in minutes
 * Cache age > 30min shows warning color
 */
export const VERY_STALE_THRESHOLD_MINUTES = 30;

/**
 * Garbage collection constants
 */

/**
 * Maximum age for cache files before deletion (7 days)
 */
export const GC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Maximum number of cache files to keep
 */
export const GC_MAX_CACHE_FILES = 20;

/**
 * Maximum number of provider-detect files to keep
 */
export const GC_MAX_PROVIDER_DETECT_FILES = 20;

/**
 * Maximum age for orphaned .tmp files before deletion (1 hour)
 */
export const GC_ORPHAN_TMP_AGE_MS = 60 * 60 * 1000;

/**
 * Log rotation (debug mode only)
 */

/**
 * Probability of running rotation checks on any given invocation (1/20)
 */
export const LOG_ROTATION_PROBABILITY = 0.05;

/**
 * Maximum log file size before rotation (500 KB)
 */
export const LOG_MAX_SIZE_BYTES = 512 * 1024;

/**
 * Maximum log file age before rotation and gzip compression (24 hours)
 */
export const LOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum age for compressed log archives before deletion (3 days)
 */
export const LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
