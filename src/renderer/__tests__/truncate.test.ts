/**
 * Tests for truncate module
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  getTerminalWidth,
  computeMaxWidth,
  visibleLength,
  ansiAwareTruncate,
  COMPONENT_DROP_PRIORITY,
} from '../truncate.js';

describe('getTerminalWidth', () => {
  let originalColumns: number | undefined;
  let originalColsEnv: string | undefined;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
    originalColsEnv = process.env['CC_STATUSLINE_COLS'];
  });

  afterEach(() => {
    // Restore original value
    if (originalColumns !== undefined) {
      process.stdout.columns = originalColumns;
    } else {
      // @ts-expect-error - deleting for test cleanup
      delete process.stdout.columns;
    }
    // Restore env var
    if (originalColsEnv !== undefined) {
      process.env['CC_STATUSLINE_COLS'] = originalColsEnv;
    } else {
      delete process.env['CC_STATUSLINE_COLS'];
    }
  });

  test('returns process.stdout.columns when defined', () => {
    process.stdout.columns = 120;
    expect(getTerminalWidth()).toBe(120);
  });

  test('returns 200 when columns is undefined (piped mode)', () => {
    // @ts-expect-error - simulating piped mode
    delete process.stdout.columns;
    expect(getTerminalWidth()).toBe(200);
  });

  test('returns 200 when columns is 0', () => {
    process.stdout.columns = 0;
    expect(getTerminalWidth()).toBe(200);
  });

  test('returns 200 when columns is negative', () => {
    process.stdout.columns = -1;
    expect(getTerminalWidth()).toBe(200);
  });

  test('respects CC_STATUSLINE_COLS env var when columns is undefined', () => {
    // @ts-expect-error - simulating piped mode
    delete process.stdout.columns;
    process.env['CC_STATUSLINE_COLS'] = '150';
    expect(getTerminalWidth()).toBe(150);
  });

  test('ignores invalid CC_STATUSLINE_COLS values', () => {
    // @ts-expect-error - simulating piped mode
    delete process.stdout.columns;
    process.env['CC_STATUSLINE_COLS'] = 'invalid';
    expect(getTerminalWidth()).toBe(200);
  });

  test('ignores negative CC_STATUSLINE_COLS values', () => {
    // @ts-expect-error - simulating piped mode
    delete process.stdout.columns;
    process.env['CC_STATUSLINE_COLS'] = '-50';
    expect(getTerminalWidth()).toBe(200);
  });

  test('prioritizes process.stdout.columns over CC_STATUSLINE_COLS', () => {
    process.stdout.columns = 100;
    process.env['CC_STATUSLINE_COLS'] = '150';
    expect(getTerminalWidth()).toBe(100);
  });
});

describe('computeMaxWidth', () => {
  test('calculates width from percentage', () => {
    expect(computeMaxWidth(100, 80)).toBe(80);
    expect(computeMaxWidth(200, 50)).toBe(100);
    expect(computeMaxWidth(120, 75)).toBe(90);
  });

  test('clamps percentage to 20-100 range', () => {
    expect(computeMaxWidth(100, 10)).toBe(20); // 10% clamped to 20%
    expect(computeMaxWidth(100, 150)).toBe(100); // 150% clamped to 100%
    expect(computeMaxWidth(100, 0)).toBe(20);
    expect(computeMaxWidth(100, 200)).toBe(100);
  });

  test('floors result to integer', () => {
    expect(computeMaxWidth(100, 33)).toBe(33); // 33% of 100 = 33
    expect(computeMaxWidth(101, 50)).toBe(50); // 50.5 → 50
  });
});

describe('visibleLength', () => {
  test('returns length of plain text', () => {
    expect(visibleLength('hello')).toBe(5);
    expect(visibleLength('Daily 24%')).toBe(9);
  });

  test('excludes ANSI color codes', () => {
    expect(visibleLength('\x1b[31mred\x1b[0m')).toBe(3); // "red"
    expect(visibleLength('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe(10); // "bold green"
  });

  test('handles complex ANSI codes', () => {
    // Multiple codes
    expect(visibleLength('\x1b[1;4;31mtext\x1b[0m')).toBe(4);
    // 256-color codes
    expect(visibleLength('\x1b[38;5;196mtext\x1b[0m')).toBe(4);
    // RGB codes
    expect(visibleLength('\x1b[38;2;255;0;0mtext\x1b[0m')).toBe(4);
  });

  test('handles text with multiple colored segments', () => {
    const text = '\x1b[32mgreen\x1b[0m \x1b[31mred\x1b[0m';
    expect(visibleLength(text)).toBe(9); // "green red"
  });

  test('handles empty string', () => {
    expect(visibleLength('')).toBe(0);
  });

  test('handles Unicode characters', () => {
    // Note: emoji characters can be counted as 2 by .length (surrogate pairs)
    expect(visibleLength('emoji: 📅')).toBe(9); // "emoji: " (7) + 📅 (2)
    expect(visibleLength('arrow: ⟳')).toBe(8); // "arrow: " (7) + ⟳ (1)
  });
});

describe('ansiAwareTruncate', () => {
  test('returns text unchanged when under max width', () => {
    const text = 'hello';
    expect(ansiAwareTruncate(text, 10)).toBe('hello');
  });

  test('truncates plain text with ellipsis', () => {
    const text = 'hello world';
    expect(ansiAwareTruncate(text, 8)).toBe('hello w…');
    expect(visibleLength(ansiAwareTruncate(text, 8))).toBe(8);
  });

  test('preserves ANSI codes up to truncation point', () => {
    const text = '\x1b[31mhello world\x1b[0m';
    const truncated = ansiAwareTruncate(text, 8);
    expect(truncated).toBe('\x1b[31mhello w…');
    expect(visibleLength(truncated)).toBe(8);
  });

  test('handles multiple ANSI codes', () => {
    const text = '\x1b[1m\x1b[32mbold green text\x1b[0m';
    const truncated = ansiAwareTruncate(text, 10);
    expect(truncated).toContain('\x1b[1m\x1b[32m'); // Preserves codes
    expect(visibleLength(truncated)).toBe(10);
  });

  test('handles ANSI codes mid-text', () => {
    const text = 'hello \x1b[31mworld\x1b[0m test';
    const truncated = ansiAwareTruncate(text, 12);
    expect(truncated).toContain('\x1b[31m'); // Preserves color code
    expect(visibleLength(truncated)).toBe(12);
  });

  test('truncates at exact maxWidth', () => {
    const text = '12345678901234567890';
    const truncated = ansiAwareTruncate(text, 10);
    expect(visibleLength(truncated)).toBe(10);
    expect(truncated).toBe('123456789…');
  });

  test('handles maxWidth = 1 (edge case)', () => {
    const text = 'hello';
    const truncated = ansiAwareTruncate(text, 1);
    expect(truncated).toBe('…');
    expect(visibleLength(truncated)).toBe(1);
  });

  test('handles empty string', () => {
    expect(ansiAwareTruncate('', 10)).toBe('');
  });

  test('handles text exactly at maxWidth', () => {
    const text = '12345';
    expect(ansiAwareTruncate(text, 5)).toBe('12345');
  });

  test('preserves colors across truncation boundary', () => {
    // Color starts before truncation, continues after
    const text = '\x1b[32mhello world test\x1b[0m';
    const truncated = ansiAwareTruncate(text, 10);
    expect(truncated).toBe('\x1b[32mhello wor…');
    expect(visibleLength(truncated)).toBe(10);
  });

  test('handles Unicode in truncation', () => {
    const text = 'emoji 📅 test';
    const truncated = ansiAwareTruncate(text, 10);
    expect(visibleLength(truncated)).toBe(10);
    expect(truncated).toContain('…');
  });

  test('handles complex statusline output', () => {
    const text =
      '\x1b[2mDaily\x1b[0m \x1b[32m━━━━━━━━\x1b[0m \x1b[32m24%\x1b[0m\x1b[2m·3h 12m\x1b[0m | \x1b[2mWeekly\x1b[0m \x1b[32m●●○○○○\x1b[0m \x1b[32m22%\x1b[0m\x1b[2m·5d 3h\x1b[0m';
    const truncated = ansiAwareTruncate(text, 40);
    expect(visibleLength(truncated)).toBe(40);
    // Should preserve ANSI codes
    expect(truncated).toContain('\x1b[');
    expect(truncated).toContain('…');
  });
});

describe('COMPONENT_DROP_PRIORITY', () => {
  test('defines correct priority order', () => {
    expect(COMPONENT_DROP_PRIORITY).toEqual([
      'plan',
      'tokens',
      'rateLimit',
      'monthly',
      'countdown',
      'weekly',
      'daily',
      'balance',
    ]);
  });

  test('has all expected components', () => {
    const priority = [...COMPONENT_DROP_PRIORITY];
    expect(priority).toContain('plan');
    expect(priority).toContain('tokens');
    expect(priority).toContain('rateLimit');
    expect(priority).toContain('monthly');
    expect(priority).toContain('countdown');
    expect(priority).toContain('weekly');
    expect(priority).toContain('daily');
    expect(priority).toContain('balance');
  });

  test('plan is lowest priority (dropped first)', () => {
    expect(COMPONENT_DROP_PRIORITY[0]).toBe('plan');
  });

  test('balance is highest priority (dropped last)', () => {
    expect(COMPONENT_DROP_PRIORITY[COMPONENT_DROP_PRIORITY.length - 1]).toBe('balance');
  });
});
