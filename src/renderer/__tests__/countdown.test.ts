/**
 * Tests for countdown sub-component rendering
 */

import { describe, test, expect } from 'vitest';
import { renderCountdown } from '../countdown.js';
import type { CountdownConfig } from '../../types/config.js';

describe('renderCountdown', () => {
  // Helper to get a future timestamp relative to now
  function getFutureTime(ms: number): string {
    return new Date(Date.now() + ms).toISOString();
  }

  // Helper to get a past timestamp relative to now
  function getPastTime(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  describe('null handling', () => {
    test('returns empty string for null resetsAt', () => {
      const config: CountdownConfig = {};
      expect(renderCountdown(null, config, '24h')).toBe('');
    });

    test('returns empty string for invalid timestamp', () => {
      const config: CountdownConfig = {};
      expect(renderCountdown('invalid-date', config, '24h')).toBe('');
      expect(renderCountdown('not-a-timestamp', config, '24h')).toBe('');
    });
  });

  describe('auto format', () => {
    test('shows "now" for < 60s', () => {
      const resetsAt = getFutureTime(30000); // 30s
      const config: CountdownConfig = { format: 'auto' };
      expect(renderCountdown(resetsAt, config, '24h')).toBe('·now');
    });

    test('shows duration for ≤ 24h', () => {
      const resetsAt = getFutureTime(3.5 * 3600000); // 3h 30m
      const config: CountdownConfig = { format: 'auto' };
      // Pattern match to tolerate minor slippage
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·3h(29m|30m)$/);
    });

    test('shows date for > 24h', () => {
      const resetsAt = getFutureTime(48 * 3600000); // 2 days
      const config: CountdownConfig = { format: 'auto' };
      const result = renderCountdown(resetsAt, config, '24h');
      // Should show date format (depends on exact date/time)
      expect(result).toMatch(/·\w+ \d+/);
    });
  });

  describe('duration format', () => {
    test('shows "now" for < 60s', () => {
      const resetsAt = getFutureTime(45000); // 45s
      const config: CountdownConfig = { format: 'duration' };
      expect(renderCountdown(resetsAt, config, '24h')).toBe('·now');
    });

    test('shows minutes for < 1h', () => {
      const resetsAt = getFutureTime(45 * 60000); // 45m
      const config: CountdownConfig = { format: 'duration' };
      // Pattern match to tolerate 1-second slippage
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·(44m|45m)$/);
    });

    test('shows hours and minutes for ≥ 1h', () => {
      const resetsAt = getFutureTime(3.5 * 3600000); // 3h 30m
      const config: CountdownConfig = { format: 'duration' };
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·3h(29m|30m)$/);
    });

    test('shows days and hours for ≥ 1d', () => {
      const resetsAt = getFutureTime(2 * 86400000 + 5 * 3600000); // 2d 5h
      const config: CountdownConfig = { format: 'duration' };
      // Large time scale, but allow 1-second tolerance
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·2d (4h|5h)$/);
    });

    test('handles exact hour boundaries', () => {
      const resetsAt = getFutureTime(2 * 3600000); // 2h 0m
      const config: CountdownConfig = { format: 'duration' };
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·(1h59m|2h0m)$/);
    });

    test('handles exact day boundaries', () => {
      const resetsAt = getFutureTime(1 * 86400000); // 1d 0h
      const config: CountdownConfig = { format: 'duration' };
      expect(renderCountdown(resetsAt, config, '24h')).toBe('·1d 0h');
    });
  });

  describe('time format', () => {
    test('shows wall-clock time in 24h format', () => {
      const resetsAt = getFutureTime(5 * 3600000); // 5h from now
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(resetsAt, config, '24h');
      // Accept both same-day ("·Fri 17:00") and next-day ("·Fri 27 00:00")
      expect(result).toMatch(/·\w+( \d+)? \d{2}:\d{2}/);
    });

    test('shows wall-clock time in 12h format', () => {
      const resetsAt = getFutureTime(5 * 3600000); // 5h from now
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(resetsAt, config, '12h');
      // Accept both same-day ("·Fri 5pm") and next-day ("·Fri 27 12am")
      expect(result).toMatch(/·\w+( \d+)? \d{1,2}(:\d{2})?(am|pm)/);
    });

    test('shows day of week for future time', () => {
      const resetsAt = getFutureTime(5 * 3600000); // 5h from now
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(resetsAt, config, '24h');
      expect(result).toMatch(/·\w+/); // Should start with weekday
    });

    test('shows date for time far in future', () => {
      const resetsAt = getFutureTime(7 * 86400000); // 7 days from now
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(resetsAt, config, '24h');
      expect(result).toMatch(/·\w+ \d+/); // Should have weekday/month and date
    });
  });

  describe('custom dividers', () => {
    test('uses default divider "·"', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = {};
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^·/);
    });

    test('uses custom divider ", "', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = { divider: ', ' };
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^, /);
    });

    test('uses custom divider " "', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = { divider: ' ' };
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^ /);
    });

    test('uses custom divider "→"', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = { divider: '→' };
      expect(renderCountdown(resetsAt, config, '24h')).toMatch(/^→/);
    });
  });

  describe('custom prefix', () => {
    test('uses empty prefix by default', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = {};
      const result = renderCountdown(resetsAt, config, '24h');
      // Pattern match to avoid time slippage (59m59s-1h0m acceptable)
      expect(result).toMatch(/^·(59m|1h0m)$/);
    });

    test('uses custom prefix "resets "', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = { prefix: 'resets ' };
      const result = renderCountdown(resetsAt, config, '24h');
      expect(result).toMatch(/^·resets (59m|1h0m)$/);
    });

    test('combines custom divider and prefix', () => {
      const resetsAt = getFutureTime(3600000); // 1h
      const config: CountdownConfig = { divider: ', ', prefix: 'resets ' };
      const result = renderCountdown(resetsAt, config, '24h');
      expect(result).toMatch(/^, resets (59m|1h0m)$/);
    });
  });

  describe('edge cases', () => {
    test('handles past reset time as "now"', () => {
      const resetsAt = getPastTime(1000); // 1s ago
      const config: CountdownConfig = {};
      expect(renderCountdown(resetsAt, config, '24h')).toBe('·now');
    });

    test('formats absolute timestamps in 24h clock format', () => {
      const midnight = new Date('2026-02-27T00:00:00Z').toISOString();
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(midnight, config, '24h');
      expect(result).toMatch(/·\w+( \d+)? \d{2}:\d{2}/);
    });

    test('formats absolute timestamps in 12h clock format', () => {
      const midnight = new Date('2026-02-27T00:00:00Z').toISOString();
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(midnight, config, '12h');
      expect(result).toMatch(/·\w+( \d+)? \d{1,2}(:\d{2})?(am|pm)/);
    });

    test('formats noon absolute timestamps in 12h clock format', () => {
      const noon = new Date('2026-02-27T12:00:00Z').toISOString();
      const config: CountdownConfig = { format: 'time' };
      const result = renderCountdown(noon, config, '12h');
      expect(result).toMatch(/·\w+( \d+)? \d{1,2}(:\d{2})?(am|pm)/);
    });
  });
});
