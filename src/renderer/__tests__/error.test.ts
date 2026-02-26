/**
 * Tests for error state rendering
 */

import { describe, test, expect } from 'vitest';
import { renderError, calculateCacheAge } from '../error.js';
import { stripAnsi } from '../colors.js';

describe('renderError', () => {
  describe('without-cache mode (standalone errors)', () => {
    test('renders auth error', () => {
      const result = renderError('auth-error', 'without-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('Auth error');
    });

    test('renders rate limited error', () => {
      const result = renderError('rate-limited', 'without-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('Rate limited');
    });

    test('renders provider unknown error', () => {
      const result = renderError('provider-unknown', 'without-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('Unknown provider');
    });

    test('renders missing env vars error', () => {
      const result = renderError('missing-env', 'without-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('ANTHROPIC_BASE_URL');
      expect(plain).toContain('ANTHROPIC_AUTH_TOKEN');
    });

    test('renders network error with provider context', () => {
      const result = renderError('network-error', 'without-cache', 'sub2api', 'connection refused');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('sub2api');
      expect(plain).toContain('connection refused');
    });

    test('renders server error with default message', () => {
      const result = renderError('server-error', 'without-cache', 'sub2api');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('sub2api');
      expect(plain).toContain('server error');
    });

    test('renders parse error', () => {
      const result = renderError('parse-error', 'without-cache', 'sub2api', 'invalid JSON');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('sub2api');
      expect(plain).toContain('invalid JSON');
    });
  });

  describe('with-cache mode (indicators)', () => {
    test('renders offline indicator', () => {
      const result = renderError('network-error', 'with-cache', undefined, undefined, 10);
      const plain = stripAnsi(result);
      expect(plain).toContain('[offline]');
    });

    test('renders stale indicator', () => {
      const result = renderError('server-error', 'with-cache', undefined, undefined, 10);
      const plain = stripAnsi(result);
      expect(plain).toContain('[stale');
      expect(plain).toContain('10m');
    });

    test('renders parse error indicator', () => {
      const result = renderError('parse-error', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('[parse error]');
    });

    test('renders rate limited indicator', () => {
      const result = renderError('rate-limited', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('[rate limited]');
    });
  });

  describe('staleness levels', () => {
    test('no indicator for fresh cache (< 5min)', () => {
      const result = renderError('network-error', 'with-cache', undefined, undefined, 3);
      const plain = stripAnsi(result);
      expect(plain).toBe('[offline]');
      expect(plain).not.toContain('3m');
    });

    test('dim indicator for stale cache (5-30min)', () => {
      const result = renderError('server-error', 'with-cache', undefined, undefined, 15);
      const plain = stripAnsi(result);
      expect(plain).toContain('[stale');
      expect(plain).toContain('15m');
      // Should have dim styling (ANSI code)
      expect(result).toContain('\x1b[2m');
    });

    test('warning color for very stale cache (> 30min)', () => {
      const result = renderError('server-error', 'with-cache', undefined, undefined, 45);
      const plain = stripAnsi(result);
      expect(plain).toContain('[stale');
      expect(plain).toContain('45m');
      // Should have yellow/warning color (ANSI code)
      expect(result).toContain('\x1b[33m');
    });
  });

  describe('transition states', () => {
    test('renders switching provider transition', () => {
      const result = renderError('switching-provider', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⟳');
      expect(plain).toContain('Switching provider');
      // Should be dim
      expect(result).toContain('\x1b[2m');
    });

    test('renders new credentials transition', () => {
      const result = renderError('new-credentials', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⟳');
      expect(plain).toContain('New credentials');
    });

    test('renders new endpoint transition', () => {
      const result = renderError('new-endpoint', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⟳');
      expect(plain).toContain('New endpoint');
    });

    test('renders auth error waiting state', () => {
      const result = renderError('auth-error-waiting', 'with-cache');
      const plain = stripAnsi(result);
      expect(plain).toContain('⚠');
      expect(plain).toContain('Auth error');
      expect(plain).toContain('⟳');
      expect(plain).toContain('Waiting for new credentials');
    });

    test('transition states replace output even with cache', () => {
      // Transition states should not be treated as indicators
      const result = renderError('switching-provider', 'with-cache');
      const plain = stripAnsi(result);
      // Should be full message, not an indicator
      expect(plain).toMatch(/^⟳/);
    });
  });
});

describe('calculateCacheAge', () => {
  test('calculates age in minutes', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(calculateCacheAge(fiveMinutesAgo)).toBe(5);
  });

  test('calculates age for recent timestamp', () => {
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    expect(calculateCacheAge(oneMinuteAgo)).toBe(1);
  });

  test('calculates age for old timestamp', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60000).toISOString();
    expect(calculateCacheAge(oneHourAgo)).toBe(60);
  });

  test('floors to nearest minute', () => {
    const ninetySecondsAgo = new Date(Date.now() - 90000).toISOString();
    expect(calculateCacheAge(ninetySecondsAgo)).toBe(1); // 1.5 minutes → floors to 1
  });
});
