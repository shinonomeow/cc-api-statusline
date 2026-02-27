/**
 * Tests for shared QuotaWindow factory
 */

import { describe, it, expect } from 'vitest';
import { createQuotaWindow } from '../quota-window.js';

describe('createQuotaWindow', () => {
  const resetsAt = '2024-03-15T00:00:00.000Z';

  it('should create QuotaWindow with valid used/limit', () => {
    const result = createQuotaWindow(10, 50, resetsAt);

    expect(result).toEqual({
      used: 10,
      limit: 50,
      remaining: 40,
      resetsAt,
    });
  });

  it('should return null when used is undefined', () => {
    const result = createQuotaWindow(undefined, 50, resetsAt);
    expect(result).toBeNull();
  });

  it('should return null when limit is null (unlimited)', () => {
    const result = createQuotaWindow(10, null, resetsAt);
    expect(result).toBeNull();
  });

  it('should return null when limit is undefined (unlimited)', () => {
    const result = createQuotaWindow(10, undefined, resetsAt);
    expect(result).toBeNull();
  });

  it('should return null when limit is 0 (unlimited)', () => {
    const result = createQuotaWindow(10, 0, resetsAt);
    expect(result).toBeNull();
  });

  it('should return null when limit is negative', () => {
    const result = createQuotaWindow(10, -1, resetsAt);
    expect(result).toBeNull();
  });

  it('should clamp remaining to 0 when used exceeds limit', () => {
    const result = createQuotaWindow(60, 50, resetsAt);

    expect(result).toEqual({
      used: 60,
      limit: 50,
      remaining: 0,
      resetsAt,
    });
  });

  it('should handle resetsAt null', () => {
    const result = createQuotaWindow(10, 50, null);

    expect(result).toEqual({
      used: 10,
      limit: 50,
      remaining: 40,
      resetsAt: null,
    });
  });

  it('should handle zero used', () => {
    const result = createQuotaWindow(0, 50, resetsAt);

    expect(result).toEqual({
      used: 0,
      limit: 50,
      remaining: 50,
      resetsAt,
    });
  });
});
