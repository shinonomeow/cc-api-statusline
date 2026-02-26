/**
 * Error State Rendering
 *
 * Handles rendering of error indicators and transition states.
 * Supports both with-cache (append indicator) and without-cache (replace output) modes.
 */

import { dimText, ansiColor } from './colors.js';

/**
 * Error state type
 */
export type ErrorState =
  | 'network-error'
  | 'auth-error'
  | 'rate-limited'
  | 'server-error'
  | 'parse-error'
  | 'provider-unknown'
  | 'missing-env'
  | 'switching-provider'
  | 'new-credentials'
  | 'new-endpoint'
  | 'auth-error-waiting';

/**
 * Error rendering mode
 */
export type ErrorMode = 'with-cache' | 'without-cache';

/**
 * Staleness level
 */
export type StalenessLevel = 'fresh' | 'stale' | 'very-stale';

/**
 * Render error indicator or message
 *
 * @param errorState - Type of error
 * @param mode - Rendering mode (with-cache appends, without-cache replaces)
 * @param provider - Provider name (for context in error messages)
 * @param message - Additional error message details
 * @param cacheAge - Age of cached data in minutes (for staleness indicator)
 * @returns Error string to append or display
 */
export function renderError(
  errorState: ErrorState,
  mode: ErrorMode,
  provider?: string,
  message?: string,
  cacheAge?: number
): string {
  const isTransition =
    errorState === 'switching-provider' ||
    errorState === 'new-credentials' ||
    errorState === 'new-endpoint' ||
    errorState === 'auth-error-waiting';

  // Transition states always replace output (even with cache)
  if (isTransition) {
    return renderTransitionState(errorState);
  }

  // Without cache: error message replaces all output
  if (mode === 'without-cache') {
    return renderStandaloneError(errorState, provider, message);
  }

  // With cache: append indicator
  return renderErrorIndicator(errorState, cacheAge);
}

/**
 * Render transition state (dim, with clockwise arrow icon)
 */
function renderTransitionState(errorState: ErrorState): string {
  const icon = '\u27F3'; // ⟳ clockwise open circle arrow

  let message: string;
  switch (errorState) {
    case 'switching-provider':
      message = 'Switching provider...';
      break;
    case 'new-credentials':
      message = 'New credentials, refreshing...';
      break;
    case 'new-endpoint':
      message = 'New endpoint, refreshing...';
      break;
    case 'auth-error-waiting':
      // Special case: auth error + waiting
      return `${ansiColor('⚠', 'yellow')} Auth error ${dimText(`${icon} Waiting for new credentials...`)}`;
    default:
      message = 'Transitioning...';
  }

  return dimText(`${icon} ${message}`);
}

/**
 * Render standalone error message (without cache)
 */
function renderStandaloneError(
  errorState: ErrorState,
  provider?: string,
  message?: string
): string {
  const warningIcon = ansiColor('⚠', 'yellow');

  switch (errorState) {
    case 'auth-error':
      return `${warningIcon} Auth error`;
    case 'rate-limited':
      return `${warningIcon} Rate limited`;
    case 'provider-unknown':
      return `${warningIcon} Unknown provider`;
    case 'missing-env':
      return `${warningIcon} Set ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`;
    case 'network-error':
    case 'server-error':
    case 'parse-error':
      // Show provider context if available
      if (provider && message) {
        return `${warningIcon} ${provider}: ${message}`;
      } else if (provider) {
        return `${warningIcon} ${provider}: ${getDefaultMessage(errorState)}`;
      } else {
        return `${warningIcon} ${getDefaultMessage(errorState)}`;
      }
    default:
      return `${warningIcon} Error`;
  }
}

/**
 * Render error indicator (with cache - appended)
 */
function renderErrorIndicator(errorState: ErrorState, cacheAge?: number): string {
  switch (errorState) {
    case 'network-error':
      return renderStalenessIndicator('[offline]', cacheAge, false);
    case 'server-error':
      return renderStalenessIndicator('[stale]', cacheAge, true);
    case 'parse-error':
      return '[parse error]';
    case 'rate-limited':
      return '[rate limited]';
    default:
      return '[error]';
  }
}

/**
 * Render staleness indicator with age-based styling
 *
 * @param label - Indicator label
 * @param cacheAge - Age in minutes
 * @param showAge - Whether to show age (e.g. "[stale 5m]")
 * @returns Styled indicator
 */
function renderStalenessIndicator(label: string, cacheAge?: number, showAge = true): string {
  if (cacheAge === undefined) {
    return dimText(label);
  }

  const stalenessLevel = getStalenessLevel(cacheAge);

  // Build indicator text
  let text = label;
  if (showAge && cacheAge >= 5) {
    text = `[stale ${cacheAge}m]`;
  }

  // Apply styling based on staleness level
  switch (stalenessLevel) {
    case 'fresh':
      return dimText(label); // < 5min, show label without age, dimmed
    case 'stale':
      return dimText(text); // 5-30min, dim with age
    case 'very-stale':
      return ansiColor(text, 'yellow'); // > 30min, warning color with age
  }
}

/**
 * Determine staleness level from cache age
 */
function getStalenessLevel(ageMinutes: number): StalenessLevel {
  if (ageMinutes < 5) {
    return 'fresh';
  } else if (ageMinutes <= 30) {
    return 'stale';
  } else {
    return 'very-stale';
  }
}

/**
 * Get default error message for error state
 */
function getDefaultMessage(errorState: ErrorState): string {
  switch (errorState) {
    case 'network-error':
      return 'connection refused';
    case 'server-error':
      return 'server error';
    case 'parse-error':
      return 'invalid response';
    case 'auth-error':
      return 'authentication failed';
    case 'rate-limited':
      return 'rate limited';
    default:
      return 'error';
  }
}

/**
 * Calculate cache age in minutes
 *
 * @param fetchedAt - ISO-8601 timestamp of cached data
 * @returns Age in minutes
 */
export function calculateCacheAge(fetchedAt: string): number {
  const now = Date.now();
  const fetched = new Date(fetchedAt).getTime();
  const ageMs = now - fetched;
  return Math.floor(ageMs / 60000); // Convert to minutes
}
