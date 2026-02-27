/**
 * Tests for divider rendering
 */

import { describe, test, expect } from 'vitest';
import { renderDivider } from '../divider.js';
import { stripAnsi } from '../colors.js';

describe('renderDivider', () => {
  test('renders default divider (|, 1 space padding)', () => {
    const result = renderDivider({});
    expect(result).toBe(' | ');
  });

  test('renders custom text divider', () => {
    const result = renderDivider({ text: '·', padding: 1 });
    expect(result).toBe(' · ');
  });

  test('renders divider with no padding', () => {
    const result = renderDivider({ text: '|', padding: 0 });
    expect(result).toBe('|');
  });

  test('renders divider with extra padding', () => {
    const result = renderDivider({ text: '|', padding: 2 });
    expect(result).toBe('  |  ');
  });

  test('renders divider with color', () => {
    const result = renderDivider({ text: '|', color: 'gray', padding: 1 });
    // Should contain the text
    expect(stripAnsi(result)).toBe(' | ');
    // Should contain ANSI escape codes
    expect(result).toContain('\x1b[');
  });

  test('renders empty text divider', () => {
    const result = renderDivider({ text: '', padding: 0 });
    expect(result).toBe('');
  });
});

