/**
 * Core constants shared across modules
 *
 * Centralizes hardcoded values for maintainability.
 */

/**
 * Loading fallback text (unused currently, reserved for future TUI mode)
 */
export const LOADING_FALLBACK = '⏳ Loading...';

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
