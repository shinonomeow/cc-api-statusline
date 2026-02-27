/**
 * Formatting utilities for currency and compact numbers
 */

/**
 * Format a number as currency (USD) with no decimals
 * @param n - The number to format
 * @returns Formatted string like "$65"
 */
export function formatCurrency(n: number): string {
  return `$${Math.floor(n)}`;
}

/**
 * Format a used/limit pair as currency quota
 * @param used - The used amount
 * @param limit - The limit amount
 * @returns Formatted string like "$65/$275"
 */
export function formatCurrencyQuota(used: number, limit: number): string {
  return `${formatCurrency(used)}/$${Math.floor(limit)}`;
}

/**
 * Format a number in compact form with dynamic unit selection
 * Rules:
 * - < 1K: show as-is ("999")
 * - 1K-9.9K: K with 1 decimal ("1.2K")
 * - 10K-999K: K with no decimal ("12K")
 * - 1M-9.9M: M with 1 decimal ("1.2M")
 * - 10M-999M: M with no decimal ("12M")
 * - 1B+: B with same pattern
 *
 * @param n - The number to format
 * @returns Compact formatted string
 */
export function formatCompactNumber(n: number): string {
  const absN = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (absN < 1000) {
    return `${sign}${Math.round(absN)}`;
  }

  // Determine appropriate unit (checking from largest to smallest)
  // Skip a unit if formatting would result in >= 1000
  let threshold: number;
  let suffix: string;

  if (absN >= 1e9) {
    threshold = 1e9;
    suffix = 'B';
  } else if (absN >= 1e6) {
    threshold = 1e6;
    suffix = 'M';
  } else {
    // absN >= 1e3 (we already checked < 1000 above)
    threshold = 1e3;
    suffix = 'K';

    // Check if K formatting would be >= 1000K (should use M)
    const kValue = absN / 1e3;
    if (Math.round(kValue) >= 1000) {
      threshold = 1e6;
      suffix = 'M';
    }
  }

  const value = absN / threshold;
  const roundedToOneDec = Math.round(value * 10) / 10;

  // < 10: show 1 decimal, >= 10: show no decimal
  if (roundedToOneDec < 10) {
    return `${sign}${roundedToOneDec.toFixed(1)}${suffix}`;
  } else {
    return `${sign}${Math.round(value)}${suffix}`;
  }
}

/**
 * Format a used/limit pair with compact numbers
 * Each number picks its unit independently
 *
 * @param used - The used amount
 * @param limit - The limit amount
 * @returns Formatted string like "12K/50K" or "800K/1.2M"
 */
export function formatCompactQuota(used: number, limit: number): string {
  return `${formatCompactNumber(used)}/${formatCompactNumber(limit)}`;
}
