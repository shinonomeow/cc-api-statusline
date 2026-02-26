/**
 * Secure HTTP fetch with guards
 *
 * Security features:
 * - HTTPS enforcement (with loopback exception)
 * - 1MB response cap (streaming read)
 * - Cross-domain redirect blocking
 * - Timeout support via AbortSignal
 */

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

export class RedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedirectError';
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string = 'Response body exceeds 1MB limit') {
    super(message);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Check if URL is HTTPS or loopback
 */
function isSecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Allow HTTPS
    if (parsed.protocol === 'https:') {
      return true;
    }

    // Allow HTTP only for localhost/127.0.0.1
    if (parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
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
 * Secure fetch with guards
 *
 * @param url - Full URL to fetch
 * @param options - Fetch options (headers, method, body, etc.)
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param userAgent - Optional User-Agent header value
 * @returns Response text
 * @throws HttpError, TimeoutError, RedirectError, ResponseTooLargeError
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000,
  userAgent?: string | null
): Promise<string> {
  // Security: Enforce HTTPS (with loopback exception)
  if (!isSecureUrl(url)) {
    throw new HttpError(`Insecure URL rejected (must be HTTPS or localhost): ${url}`);
  }

  // Get original hostname for redirect check
  const originalHostname = getHostname(url);
  if (!originalHostname) {
    throw new HttpError(`Invalid URL: ${url}`);
  }

  // Add timeout via AbortSignal
  const signal = AbortSignal.timeout(timeoutMs);

  // Build fetch options
  const fetchOptions: RequestInit = {
    ...options,
    redirect: 'manual',
    signal,
  };

  // Add User-Agent header if provided
  if (userAgent) {
    fetchOptions.headers = {
      ...options.headers,
      'User-Agent': userAgent,
    };
  }

  try {
    // Fetch with manual redirect handling
    const response = await fetch(url, fetchOptions);

    // Check for redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');

      if (location) {
        // Check if redirect goes to different host
        const redirectHostname = getHostname(location);

        if (redirectHostname && redirectHostname !== originalHostname) {
          throw new RedirectError(
            `Cross-domain redirect blocked: ${originalHostname} → ${redirectHostname}`
          );
        }

        throw new RedirectError(`Redirect detected to: ${location}`);
      }

      throw new RedirectError('Redirect detected but Location header missing');
    }

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
      error instanceof RedirectError ||
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
