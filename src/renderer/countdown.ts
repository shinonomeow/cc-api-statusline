/**
 * Countdown Sub-Component Rendering
 *
 * Displays time remaining until a quota window resets.
 * Supports three formats: auto, duration, time.
 */

import type { CountdownConfig, ClockFormat } from '../types/config.js';

/**
 * Render countdown sub-component
 *
 * @param resetsAt - ISO-8601 timestamp of reset time, or null (returns empty string)
 * @param config - Countdown configuration
 * @param clockFormat - Global clock format (12h or 24h)
 * @returns Formatted countdown string with divider and prefix
 */
export function renderCountdown(
  resetsAt: string | null,
  config: CountdownConfig,
  clockFormat: ClockFormat
): string {
  // No reset time → no countdown
  if (!resetsAt) {
    return '';
  }

  const format = config.format ?? 'auto';
  const divider = config.divider ?? '·';
  const prefix = config.prefix ?? '';

  const resetDate = new Date(resetsAt);

  // Invalid timestamp → no countdown
  if (isNaN(resetDate.getTime())) {
    return '';
  }

  const now = new Date();
  const remainingMs = resetDate.getTime() - now.getTime();

  // Past reset time → "now"
  if (remainingMs < 0) {
    return `${divider}${prefix}now`;
  }

  let timeStr: string;

  if (format === 'auto') {
    // Auto: > 24h → date, ≤ 24h → duration, < 60s → "now"
    if (remainingMs < 60000) {
      timeStr = 'now';
    } else if (remainingMs <= 86400000) {
      // ≤ 24h → duration
      timeStr = formatDuration(remainingMs);
    } else {
      // > 24h → date
      timeStr = formatWallClock(resetDate, clockFormat);
    }
  } else if (format === 'duration') {
    // Duration: always show remaining time
    if (remainingMs < 60000) {
      timeStr = 'now';
    } else {
      timeStr = formatDuration(remainingMs);
    }
  } else {
    // Time: always show wall-clock target
    timeStr = formatWallClock(resetDate, clockFormat);
  }

  return `${divider}${prefix}${timeStr}`;
}

/**
 * Format duration as human-readable string
 *
 * Rules:
 * - ≥ 1 day → "Xd Yh"
 * - ≥ 1 hour → "XhYm"
 * - < 1 hour → "Xm"
 * - < 60s → "now"
 *
 * @param ms - Milliseconds remaining
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours >= 1) {
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Format wall-clock time
 *
 * Rules:
 * - Same day → "Mon 5pm" or "Mon 17:00"
 * - Different day, same month → "Mon 28" + time
 * - Different month → "Feb 28" + time
 *
 * @param date - Target date
 * @param clockFormat - 12h or 24h
 * @returns Formatted wall-clock string
 */
function formatWallClock(date: Date, clockFormat: ClockFormat): string {
  const now = new Date();

  // Get day of week abbreviation
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });

  // Get month abbreviation
  const month = date.toLocaleDateString('en-US', { month: 'short' });

  // Get day of month
  const dayOfMonth = date.getDate();

  // Check if same day
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  // Check if same month
  const isSameMonth = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();

  // Format time
  let timeStr: string;
  if (clockFormat === '12h') {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    if (minutes === 0) {
      timeStr = `${hour12}${ampm}`;
    } else {
      timeStr = `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
    }
  } else {
    // 24h
    const hours = date.getHours();
    const minutes = date.getMinutes();
    timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Build output
  if (isSameDay) {
    // Same day → "Mon 5pm"
    return `${dayOfWeek} ${timeStr}`;
  } else if (isSameMonth) {
    // Same month → "Mon 28 5pm"
    return `${dayOfWeek} ${dayOfMonth} ${timeStr}`;
  } else {
    // Different month → "Feb 28 5pm"
    return `${month} ${dayOfMonth} ${timeStr}`;
  }
}
