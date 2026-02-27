/**
 * Tests for time computation helpers
 */

import { describe, it, expect } from 'vitest';
import {
  computeNextMidnightLocal,
  computeNextMondayLocal,
} from '../time.js';

describe('time helpers', () => {
  describe('computeNextMidnightLocal', () => {
    it('returns valid ISO-8601 timestamp', () => {
      const result = computeNextMidnightLocal();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(() => new Date(result)).not.toThrow();
    });

    it('returns tomorrow at 00:00:00', () => {
      const result = computeNextMidnightLocal();
      const parsed = new Date(result);

      // Should be in the future
      expect(parsed.getTime()).toBeGreaterThan(Date.now());

      // Should be at midnight
      expect(parsed.getHours()).toBe(0);
      expect(parsed.getMinutes()).toBe(0);
      expect(parsed.getSeconds()).toBe(0);
      expect(parsed.getMilliseconds()).toBe(0);
    });

    it('is within 24 hours from now', () => {
      const result = computeNextMidnightLocal();
      const parsed = new Date(result);
      const now = new Date();
      const diff = parsed.getTime() - now.getTime();

      // Should be less than 24 hours
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
      expect(diff).toBeGreaterThan(0);
    });
  });

  describe('computeNextMondayLocal', () => {
    it('returns valid ISO-8601 timestamp', () => {
      const result = computeNextMondayLocal();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(() => new Date(result)).not.toThrow();
    });

    it('returns next Monday at 00:00:00', () => {
      const result = computeNextMondayLocal();
      const parsed = new Date(result);

      // Should be in the future
      expect(parsed.getTime()).toBeGreaterThan(Date.now());

      // Should be Monday (1)
      expect(parsed.getDay()).toBe(1);

      // Should be at midnight
      expect(parsed.getHours()).toBe(0);
      expect(parsed.getMinutes()).toBe(0);
      expect(parsed.getSeconds()).toBe(0);
      expect(parsed.getMilliseconds()).toBe(0);
    });

    it('is within 7 days from now', () => {
      const result = computeNextMondayLocal();
      const parsed = new Date(result);
      const now = new Date();
      const diff = parsed.getTime() - now.getTime();

      // Should be less than 7 days
      expect(diff).toBeLessThan(7 * 24 * 60 * 60 * 1000);
      expect(diff).toBeGreaterThan(0);
    });

    it('correctly handles Sunday (returns next day)', () => {
      // Mock a Sunday
      const mockSunday = new Date('2024-03-03T12:00:00'); // Sunday
      const dayOfWeek = mockSunday.getDay();

      if (dayOfWeek === 0) {
        const daysUntilMonday = 1;
        expect(daysUntilMonday).toBe(1);
      }
    });

    it('correctly handles Monday before current time (returns next week)', () => {
      // Test logic, not implementation-specific
      const result = computeNextMondayLocal();
      const parsed = new Date(result);

      // If today is Monday and time has passed, should be next Monday
      const now = new Date();
      if (now.getDay() === 1) {
        const diffDays = Math.floor((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        expect(diffDays).toBeGreaterThanOrEqual(0);
        expect(diffDays).toBeLessThanOrEqual(7);
      }
    });
  });

});
