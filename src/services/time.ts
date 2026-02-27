/**
 * Time computation helpers for quota reset calculations
 *
 * These functions compute next reset timestamps in local timezone.
 * Used by both sub2api and claude-relay-service providers.
 */

/**
 * Compute next midnight in local timezone
 */
export function computeNextMidnightLocal(): string {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  return tomorrow.toISOString();
}

/**
 * Compute next Monday 00:00 in local timezone
 */
export function computeNextMondayLocal(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Days until next Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);

  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    0, 0, 0, 0
  );
  return nextMonday.toISOString();
}

/**
 * Compute first of next month 00:00 in local timezone
 */
export function computeFirstOfNextMonthLocal(): string {
  const now = new Date();
  const nextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
    0, 0, 0, 0
  );
  return nextMonth.toISOString();
}
