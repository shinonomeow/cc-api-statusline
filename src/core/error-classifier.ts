/**
 * Fetch Error Classifier
 *
 * Classifies fetch errors into categories to drive retry/invalidation logic.
 * Pure function - no side effects.
 */

export type FetchErrorCategory = 'provider-mismatch' | 'site-closed' | 'transient';

/**
 * Classify a fetch error into a category
 *
 * - provider-mismatch: wrong response format → invalidate detection cache
 * - site-closed: endpoint gone (404/410) → no re-detect
 * - transient: auth, rate-limit, server, network → retry same provider
 *
 * @param error - The caught error value
 * @returns Category for the error
 */
export function classifyFetchError(error: unknown): FetchErrorCategory {
  if (error && typeof error === 'object') {
    // HTTP errors with status codes
    if ('statusCode' in error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        return 'site-closed';
      }
      // 401, 403, 429, 5xx → transient
      return 'transient';
    }

    if (error instanceof Error) {
      // Timeout errors → transient
      if (error.name === 'TimeoutError') {
        return 'transient';
      }

      // Large response → provider-mismatch (HTML page instead of JSON)
      if (error.name === 'ResponseTooLargeError') {
        return 'provider-mismatch';
      }

      // JSON parse failure → provider-mismatch
      if (error instanceof SyntaxError) {
        return 'provider-mismatch';
      }

      // Validation errors from response parsers
      const msg = error.message.toLowerCase();
      if (
        msg.includes('invalid response') ||
        msg.includes('expected object') ||
        msg.includes('missing data') ||
        msg.includes('missing limits')
      ) {
        return 'provider-mismatch';
      }
    }
  }

  return 'transient';
}
