/**
 * HTTP fetch with process-safety guards
 *
 * Design rationale: These guards protect our process from misbehaving endpoints.
 * HTTPS enforcement and redirect blocking were removed because Claude Code itself
 * already sends the user's API token to ANTHROPIC_BASE_URL before cc-api-statusline
 * runs — if a user configures a malicious/HTTP URL, the token is already gone.
 * Our HTTPS/redirect guards closed the barn door after the horse was gone.
 *
 * Remaining guards:
 *   1. 1MB response cap (prevents memory exhaustion from broken/malicious proxies)
 *   2. Timeout support (prevents hanging on unresponsive servers)
 */

import { DEFAULT_TIMEOUT_BUDGET_MS } from '../core/constants.js';

/**
 * Custom error types
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string = 'Response body exceeds 1MB limit') {
    super(message);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read response body with size limit (1MB)
 */
async function readBodyWithLimit(response: Response): Promise<string> {
  const MAX_SIZE = 1024 * 1024; // 1MB
  let bytesRead = 0;
  const chunks: Uint8Array[] = [];

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) break;

      if (result.value) {
        const chunk = result.value as Uint8Array;
        bytesRead += chunk.length;

        if (bytesRead > MAX_SIZE) {
          // Cancel the stream
          await reader.cancel();
          throw new ResponseTooLargeError(`Response body exceeds 1MB limit (read ${bytesRead} bytes)`);
        }

        chunks.push(chunk);
      }
    }

    // Concatenate all chunks and decode
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return decoder.decode(result);
  } catch (error: unknown) {
    if (error instanceof ResponseTooLargeError) {
      throw error;
    }
    throw new HttpError(`Failed to read response body: ${error}`);
  }
}

/**
 * Fetch with process-safety guards (1MB cap + timeout)
 *
 * @param url - Full URL to fetch
 * @param options - Fetch options (headers, method, body, etc.)
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param userAgent - Optional User-Agent header value
 * @returns Response text
 * @throws HttpError, TimeoutError, ResponseTooLargeError
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_BUDGET_MS,
  userAgent?: string | null
): Promise<string> {
  // Add timeout via AbortSignal
  const signal = AbortSignal.timeout(timeoutMs);

  // Build fetch options
  const fetchOptions: RequestInit = {
    ...options,
    redirect: 'follow',
    signal,
  };

  // Add User-Agent header if provided
  if (userAgent) {
    // Create a new Headers object from existing headers
    const headers = new Headers(options.headers);
    headers.set('User-Agent', userAgent);
    fetchOptions.headers = headers;
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Check for HTTP errors
    if (!response.ok) {
      // Try to read error body for context, but don't use it if it fails
      let errorContext = response.statusText;
      try {
        const errorBody = await readBodyWithLimit(response);
        if (errorBody) errorContext = errorBody.slice(0, 200);
      } catch {
        // Ignore read errors for error responses
      }
      throw new HttpError(`HTTP ${response.status}: ${errorContext}`, response.status, response);
    }

    // Read body with size limit
    return await readBodyWithLimit(response);
  } catch (error: unknown) {
    // Convert abort errors to TimeoutError
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
    }

    // Re-throw our custom errors
    if (
      error instanceof HttpError ||
      error instanceof TimeoutError ||
      error instanceof ResponseTooLargeError
    ) {
      throw error;
    }

    // Check for timeout in error message (Bun-specific)
    if (error instanceof Error && error.message.includes('timed out')) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
    }

    // Wrap other errors
    throw new HttpError(`Network error: ${error}`);
  }
}
