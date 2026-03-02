import { describe, it, expect } from 'vitest';
import { classifyFetchError } from '../error-classifier.js';

function httpError(statusCode: number): { statusCode: number; message: string } {
  return { statusCode, message: `HTTP ${statusCode}` };
}

describe('classifyFetchError', () => {
  describe('site-closed', () => {
    it('classifies HTTP 404 as site-closed', () => {
      expect(classifyFetchError(httpError(404))).toBe('site-closed');
    });

    it('classifies HTTP 410 as site-closed', () => {
      expect(classifyFetchError(httpError(410))).toBe('site-closed');
    });
  });

  describe('transient', () => {
    it('classifies HTTP 401 as transient', () => {
      expect(classifyFetchError(httpError(401))).toBe('transient');
    });

    it('classifies HTTP 403 as transient', () => {
      expect(classifyFetchError(httpError(403))).toBe('transient');
    });

    it('classifies HTTP 429 as transient', () => {
      expect(classifyFetchError(httpError(429))).toBe('transient');
    });

    it('classifies HTTP 500 as transient', () => {
      expect(classifyFetchError(httpError(500))).toBe('transient');
    });

    it('classifies HTTP 502 as transient', () => {
      expect(classifyFetchError(httpError(502))).toBe('transient');
    });

    it('classifies HTTP 503 as transient', () => {
      expect(classifyFetchError(httpError(503))).toBe('transient');
    });

    it('classifies TimeoutError as transient', () => {
      const err = new Error('Timed out');
      err.name = 'TimeoutError';
      expect(classifyFetchError(err)).toBe('transient');
    });

    it('classifies generic network errors as transient', () => {
      expect(classifyFetchError(new Error('Network error: ECONNRESET'))).toBe('transient');
    });

    it('classifies non-Error thrown values as transient', () => {
      expect(classifyFetchError('string error')).toBe('transient');
      expect(classifyFetchError(42)).toBe('transient');
      expect(classifyFetchError(null)).toBe('transient');
      expect(classifyFetchError(undefined)).toBe('transient');
    });
  });

  describe('provider-mismatch', () => {
    it('classifies SyntaxError as provider-mismatch', () => {
      expect(classifyFetchError(new SyntaxError('Unexpected token < in JSON'))).toBe('provider-mismatch');
    });

    it('classifies ResponseTooLargeError as provider-mismatch', () => {
      const err = new Error('Response too large');
      err.name = 'ResponseTooLargeError';
      expect(classifyFetchError(err)).toBe('provider-mismatch');
    });

    it('classifies "Invalid response: expected object" as provider-mismatch', () => {
      expect(classifyFetchError(new Error('Invalid response: expected object'))).toBe('provider-mismatch');
    });

    it('classifies "Invalid response: missing data object" as provider-mismatch', () => {
      expect(classifyFetchError(new Error('Invalid response: missing data object'))).toBe('provider-mismatch');
    });

    it('classifies "missing limits" message as provider-mismatch', () => {
      expect(classifyFetchError(new Error('Invalid response: missing limits field'))).toBe('provider-mismatch');
    });

    it('classifies "expected object" message as provider-mismatch', () => {
      expect(classifyFetchError(new Error('Parse failed: expected object, got array'))).toBe('provider-mismatch');
    });
  });
});
