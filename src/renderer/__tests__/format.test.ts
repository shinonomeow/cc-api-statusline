import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyQuota,
  formatCompactNumber,
  formatCompactQuota,
} from '../format';

describe('formatCurrency', () => {
  it('formats integers', () => {
    expect(formatCurrency(65)).toBe('$65');
    expect(formatCurrency(275)).toBe('$275');
    expect(formatCurrency(0)).toBe('$0');
  });

  it('floors decimals to integers for values >= 10', () => {
    expect(formatCurrency(65.99)).toBe('$65');
    expect(formatCurrency(156.5)).toBe('$156');
  });

  it('shows 1 decimal for values > 0 and < 10', () => {
    expect(formatCurrency(0.2)).toBe('$0.2');
    expect(formatCurrency(0.5)).toBe('$0.5');
    expect(formatCurrency(0.99)).toBe('$1.0');
    expect(formatCurrency(5.3)).toBe('$5.3');
    expect(formatCurrency(9.9)).toBe('$9.9');
  });

  it('floors at boundary values', () => {
    expect(formatCurrency(10.0)).toBe('$10');
    expect(formatCurrency(0)).toBe('$0');
  });

  it('handles large numbers', () => {
    expect(formatCurrency(1000)).toBe('$1000');
    expect(formatCurrency(999999)).toBe('$999999');
  });

  it('handles negative numbers', () => {
    expect(formatCurrency(-50)).toBe('$-50');
  });
});

describe('formatCurrencyQuota', () => {
  it('formats used/limit pairs', () => {
    expect(formatCurrencyQuota(65, 275)).toBe('$65/$275');
    expect(formatCurrencyQuota(156, 275)).toBe('$156/$275');
    expect(formatCurrencyQuota(0, 100)).toBe('$0/$100');
  });

  it('floors both values >= 10', () => {
    expect(formatCurrencyQuota(65.99, 275.5)).toBe('$65/$275');
  });

  it('shows 1 decimal for small used values', () => {
    expect(formatCurrencyQuota(5.3, 275)).toBe('$5.3/$275');
    expect(formatCurrencyQuota(0.5, 100)).toBe('$0.5/$100');
  });
});

describe('formatCompactNumber', () => {
  it('formats numbers under 1K as-is', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(500)).toBe('500');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('formats 1K-9.9K with 1 decimal', () => {
    expect(formatCompactNumber(1000)).toBe('1.0K');
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCompactNumber(9900)).toBe('9.9K');
  });

  it('formats 10K-999K with no decimal', () => {
    expect(formatCompactNumber(10000)).toBe('10K');
    expect(formatCompactNumber(12000)).toBe('12K');
    expect(formatCompactNumber(120000)).toBe('120K');
    expect(formatCompactNumber(800000)).toBe('800K');
    expect(formatCompactNumber(999000)).toBe('999K');
  });

  it('formats 1M-9.9M with 1 decimal', () => {
    expect(formatCompactNumber(1000000)).toBe('1.0M');
    expect(formatCompactNumber(1200000)).toBe('1.2M');
    expect(formatCompactNumber(9900000)).toBe('9.9M');
  });

  it('formats 10M-999M with no decimal', () => {
    expect(formatCompactNumber(10000000)).toBe('10M');
    expect(formatCompactNumber(12000000)).toBe('12M');
    expect(formatCompactNumber(120000000)).toBe('120M');
    expect(formatCompactNumber(999000000)).toBe('999M');
  });

  it('formats 1B+ with same pattern', () => {
    expect(formatCompactNumber(1000000000)).toBe('1.0B');
    expect(formatCompactNumber(1200000000)).toBe('1.2B');
    expect(formatCompactNumber(10000000000)).toBe('10B');
    expect(formatCompactNumber(120000000000)).toBe('120B');
  });

  it('handles edge cases at boundaries', () => {
    expect(formatCompactNumber(9999)).toBe('10K'); // rounds up to 10K
    expect(formatCompactNumber(999999)).toBe('1.0M'); // rounds up to 1.0M
    expect(formatCompactNumber(1000000)).toBe('1.0M');
  });
});

describe('formatCompactQuota', () => {
  it('formats pairs with independent units', () => {
    expect(formatCompactQuota(800000, 1200000)).toBe('800K/1.2M');
    expect(formatCompactQuota(9900, 50000)).toBe('9.9K/50K');
    expect(formatCompactQuota(1200000, 10000000)).toBe('1.2M/10M');
  });

  it('handles both numbers under 1K', () => {
    expect(formatCompactQuota(500, 999)).toBe('500/999');
  });

  it('handles zero values', () => {
    expect(formatCompactQuota(0, 50000)).toBe('0/50K');
  });

  it('handles matching units', () => {
    expect(formatCompactQuota(12000, 50000)).toBe('12K/50K');
    expect(formatCompactQuota(1200000, 5000000)).toBe('1.2M/5.0M');
  });
});
