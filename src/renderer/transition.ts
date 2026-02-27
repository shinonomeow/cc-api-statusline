/**
 * Transition State Detection
 *
 * Centralized logic for identifying transition error states.
 */

import type { ErrorState } from './error.js';

/**
 * Check if error state is a transition state
 *
 * Transition states indicate temporary conditions during provider/credential changes.
 * These always replace output (even with cache) rather than appending indicators.
 */
export function isTransitionState(errorState: ErrorState): boolean {
  return (
    errorState === 'switching-provider' ||
    errorState === 'new-credentials' ||
    errorState === 'new-endpoint' ||
    errorState === 'auth-error-waiting'
  );
}
