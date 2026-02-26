/**
 * Tests for nerd-font icon mapping
 */

import { describe, test, expect } from 'vitest';
import { getProgressIcon } from '../icons.js';

describe('getProgressIcon', () => {
  test('returns empty icon for 0%', () => {
    const icon = getProgressIcon(0);
    expect(icon).toBe('\u{F0130}'); // 󰄰 empty
  });

  test('returns 12.5% icon for 1-12.5%', () => {
    expect(getProgressIcon(1)).toBe('\u{F0A9E}'); // 󰪞
    expect(getProgressIcon(12)).toBe('\u{F0A9E}');
    expect(getProgressIcon(12.5)).toBe('\u{F0A9E}');
  });

  test('returns 25% icon for 12.6-25%', () => {
    expect(getProgressIcon(12.6)).toBe('\u{F0A9F}'); // 󰪟
    expect(getProgressIcon(20)).toBe('\u{F0A9F}');
    expect(getProgressIcon(25)).toBe('\u{F0A9F}');
  });

  test('returns 37.5% icon for 25.1-37.5%', () => {
    expect(getProgressIcon(25.1)).toBe('\u{F0AA0}'); // 󰪠
    expect(getProgressIcon(30)).toBe('\u{F0AA0}');
    expect(getProgressIcon(37.5)).toBe('\u{F0AA0}');
  });

  test('returns 50% icon for 37.6-50%', () => {
    expect(getProgressIcon(37.6)).toBe('\u{F0AA1}'); // 󰪡
    expect(getProgressIcon(45)).toBe('\u{F0AA1}');
    expect(getProgressIcon(50)).toBe('\u{F0AA1}');
  });

  test('returns 62.5% icon for 50.1-62.5%', () => {
    expect(getProgressIcon(50.1)).toBe('\u{F0AA2}'); // 󰪢
    expect(getProgressIcon(60)).toBe('\u{F0AA2}');
    expect(getProgressIcon(62.5)).toBe('\u{F0AA2}');
  });

  test('returns 75% icon for 62.6-75%', () => {
    expect(getProgressIcon(62.6)).toBe('\u{F0AA3}'); // 󰪣
    expect(getProgressIcon(70)).toBe('\u{F0AA3}');
    expect(getProgressIcon(75)).toBe('\u{F0AA3}');
  });

  test('returns 87.5% icon for 75.1-87.5%', () => {
    expect(getProgressIcon(75.1)).toBe('\u{F0AA4}'); // 󰪤
    expect(getProgressIcon(80)).toBe('\u{F0AA4}');
    expect(getProgressIcon(87.5)).toBe('\u{F0AA4}');
  });

  test('returns 100% icon for 87.6-100%', () => {
    expect(getProgressIcon(87.6)).toBe('\u{F0AA5}'); // 󰪥
    expect(getProgressIcon(95)).toBe('\u{F0AA5}');
    expect(getProgressIcon(100)).toBe('\u{F0AA5}');
  });

  test('returns empty icon for null', () => {
    expect(getProgressIcon(null)).toBe('\u{F0130}'); // 󰄰 empty
  });

  test('clamps negative percentages to 0', () => {
    expect(getProgressIcon(-10)).toBe('\u{F0130}'); // 󰄰 empty
    expect(getProgressIcon(-1)).toBe('\u{F0130}');
  });

  test('clamps percentages > 100 to 100', () => {
    expect(getProgressIcon(101)).toBe('\u{F0AA5}'); // 󰪥 full
    expect(getProgressIcon(150)).toBe('\u{F0AA5}');
  });

  test('handles boundary values correctly', () => {
    // Test exact boundary values
    expect(getProgressIcon(0)).toBe('\u{F0130}'); // 0% → empty
    expect(getProgressIcon(12.5)).toBe('\u{F0A9E}'); // 12.5% → index 1
    expect(getProgressIcon(25)).toBe('\u{F0A9F}'); // 25% → index 2
    expect(getProgressIcon(37.5)).toBe('\u{F0AA0}'); // 37.5% → index 3
    expect(getProgressIcon(50)).toBe('\u{F0AA1}'); // 50% → index 4
    expect(getProgressIcon(62.5)).toBe('\u{F0AA2}'); // 62.5% → index 5
    expect(getProgressIcon(75)).toBe('\u{F0AA3}'); // 75% → index 6
    expect(getProgressIcon(87.5)).toBe('\u{F0AA4}'); // 87.5% → index 7
    expect(getProgressIcon(100)).toBe('\u{F0AA5}'); // 100% → index 8
  });

  test('formula verification: Math.min(8, Math.ceil(percent / 12.5))', () => {
    // Verify the formula directly
    const testCases = [
      { percent: 0, expectedIndex: 0 },
      { percent: 0.01, expectedIndex: 1 },
      { percent: 12.5, expectedIndex: 1 },
      { percent: 12.51, expectedIndex: 2 },
      { percent: 25, expectedIndex: 2 },
      { percent: 50, expectedIndex: 4 },
      { percent: 75, expectedIndex: 6 },
      { percent: 100, expectedIndex: 8 },
    ];

    for (const { percent, expectedIndex } of testCases) {
      const icon = getProgressIcon(percent);
      const icons = [
        '\u{F0130}',
        '\u{F0A9E}',
        '\u{F0A9F}',
        '\u{F0AA0}',
        '\u{F0AA1}',
        '\u{F0AA2}',
        '\u{F0AA3}',
        '\u{F0AA4}',
        '\u{F0AA5}',
      ];
      expect(icon).toBe(icons[expectedIndex]);
    }
  });
});
