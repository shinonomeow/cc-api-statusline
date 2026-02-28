/**
 * Tests for divider rendering
 */

import { describe, test, expect } from 'vitest';
import { renderDivider } from '../divider.js';
import { stripAnsi } from '../colors.js';

describe('renderDivider', () => {
  test('renders default divider (|, 1 space margin)', () => {
    const result = renderDivider({});
    // Default color is cc-statusline brightBlack, so strip ANSI to check text
    expect(stripAnsi(result)).toBe(' | ');
    // Should contain ANSI escape codes for default color
    expect(result).toContain('\x1b[');
  });

  test('renders custom text divider', () => {
    const result = renderDivider({ text: '·', margin: 1 });
    expect(stripAnsi(result)).toBe(' · ');
    expect(result).toContain('\x1b[');
  });

  test('renders divider with no margin', () => {
    const result = renderDivider({ text: '|', margin: 0 });
    expect(stripAnsi(result)).toBe('|');
    expect(result).toContain('\x1b[');
  });

  test('renders divider with extra margin', () => {
    const result = renderDivider({ text: '|', margin: 2 });
    expect(stripAnsi(result)).toBe('  |  ');
    expect(result).toContain('\x1b[');
  });

  test('renders divider with color', () => {
    const result = renderDivider({ text: '|', color: 'gray', margin: 1 });
    // Should contain the text
    expect(stripAnsi(result)).toBe(' | ');
    // Should contain ANSI escape codes
    expect(result).toContain('\x1b[');
  });

  test('renders empty text divider', () => {
    const result = renderDivider({ text: '', margin: 0 });
    // Empty text still gets ANSI codes for color
    expect(stripAnsi(result)).toBe('');
    expect(result).toContain('\x1b[');
  });
});

