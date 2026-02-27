import { describe, it, expect } from 'vitest';
import {
  HttpError,
  TimeoutError,
  ResponseTooLargeError,
} from '../http.js';

/**
 * HTTP Service Tests
 *
 * Note: All network-dependent tests are skipped to ensure deterministic results.
 * These tests verify the error types and module exports.
 * Network behavior is tested in e2e/integration tests.
 */

describe('http service', () => {
  describe('error types', () => {
    it('HttpError should have correct properties', () => {
      const error = new HttpError('Test error', 404);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.name).toBe('HttpError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(404);
    });

    it('TimeoutError should have correct properties', () => {
      const error = new TimeoutError('Custom timeout');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Custom timeout');
    });

    it('ResponseTooLargeError should have correct properties', () => {
      const error = new ResponseTooLargeError('Too big');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ResponseTooLargeError);
      expect(error.name).toBe('ResponseTooLargeError');
      expect(error.message).toBe('Too big');
    });
  });
});
