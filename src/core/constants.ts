/**
 * Core constants shared across modules
 *
 * Centralizes hardcoded values for maintainability.
 */

/**
 * Root timeout budget in milliseconds
 * Matches CC_STATUSLINE_TIMEOUT; all derived timeouts flow from here
 */
export const DEFAULT_TIMEOUT_BUDGET_MS = 5000;

/**
 * TTY (direct/--once) timeout budget in milliseconds
 * TTY mode gets 2× the default budget since there is no external SIGKILL deadline
 */
export const TTY_TIMEOUT_BUDGET_MS = DEFAULT_TIMEOUT_BUDGET_MS * 2;

/**
 * Exit buffer in milliseconds
 * Reserves time to write output before timeout deadline
 */
export const EXIT_BUFFER_MS = 50;

/**
 * Timeout headroom in milliseconds
 * Shared safety margin subtracted by watchdog and fetch cap
 */
export const TIMEOUT_HEADROOM_MS = 100;

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

/**
 * Wildcard sentinel in healthMatch patterns
 * Means: field must exist and be a string (any value)
 */
export const HEALTH_MATCH_WILDCARD = '*';

/**
 * Detection TTL constants (seconds)
 *
 * Dynamic TTL adjusts based on probe outcome:
 * - Stable provider: doubles each maintenance probe (24h → 48h → 96h → 7d cap)
 * - Provider changed: resets to 1h (confirm change quickly)
 * - Probe failed: shrinks to 5min (retry soon)
 */

/** Initial TTL for new detections: 24 hours */
export const DETECTION_TTL_BASE_S = 86400;

/** Maximum TTL after repeated healthy probes: 7 days */
export const DETECTION_TTL_MAX_S = 604800;

/** TTL when provider identity changed: 1 hour */
export const DETECTION_TTL_CHANGED_S = 3600;

/** TTL when health probe failed: 5 minutes */
export const DETECTION_TTL_FAILED_S = 300;

/**
 * Probability that a Path A/B cycle triggers a cache GC scan
 * ~10% — avoids FS scan every cycle while keeping files tidy
 */
export const MAINTENANCE_GC_PROBABILITY = 0.10;
