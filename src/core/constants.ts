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
 * Maximum age for orphaned .tmp files before deletion (1 hour)
 */
export const GC_ORPHAN_TMP_AGE_MS = 60 * 60 * 1000;
