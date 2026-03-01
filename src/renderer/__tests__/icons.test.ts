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

  test('returns 12.5% icon for 1-12%', () => {
    expect(getProgressIcon(1)).toBe('\u{F0A9E}'); // 󰪞
    expect(getProgressIcon(12)).toBe('\u{F0A9E}');
    // Note: 12.5 rounds to 13 → index 2 (25% icon), not index 1
  });

  test('returns 25% icon for 12.5-25%', () => {
    expect(getProgressIcon(12.5)).toBe('\u{F0A9F}'); // 󰪟 — 12.5 rounds to 13 → index 2
    expect(getProgressIcon(20)).toBe('\u{F0A9F}');
    expect(getProgressIcon(25)).toBe('\u{F0A9F}');
  });

  test('returns 37.5% icon for 25.5-37.4%', () => {
    expect(getProgressIcon(26)).toBe('\u{F0AA0}'); // 󰪠 — 26 rounds to 26 → index 3
    expect(getProgressIcon(30)).toBe('\u{F0AA0}');
    expect(getProgressIcon(37)).toBe('\u{F0AA0}');
    // Note: 25.1 rounds to 25 → index 2; 37.5 rounds to 38 → index 4
  });

  test('returns 50% icon for 37.5-50%', () => {
    expect(getProgressIcon(37.5)).toBe('\u{F0AA1}'); // 󰪡 — 37.5 rounds to 38 → index 4
    expect(getProgressIcon(45)).toBe('\u{F0AA1}');
    expect(getProgressIcon(50)).toBe('\u{F0AA1}');
  });

  test('returns 62.5% icon for 50.5-62.4%', () => {
    expect(getProgressIcon(51)).toBe('\u{F0AA2}'); // 󰪢 — 51 rounds to 51 → index 5
    expect(getProgressIcon(60)).toBe('\u{F0AA2}');
    expect(getProgressIcon(62)).toBe('\u{F0AA2}');
    // Note: 62.5 rounds to 63 → index 6 (75% icon)
  });

  test('returns 75% icon for 62.5-75%', () => {
    expect(getProgressIcon(62.5)).toBe('\u{F0AA3}'); // 󰪣 — 62.5 rounds to 63 → index 6
    expect(getProgressIcon(70)).toBe('\u{F0AA3}');
    expect(getProgressIcon(75)).toBe('\u{F0AA3}');
  });

  test('returns 87.5% icon for 75.5-87.4%', () => {
    expect(getProgressIcon(76)).toBe('\u{F0AA4}'); // 󰪤 — 76 rounds to 76 → index 7
    expect(getProgressIcon(80)).toBe('\u{F0AA4}');
    expect(getProgressIcon(87)).toBe('\u{F0AA4}');
    // Note: 87.5 rounds to 88 → index 8 (100% icon)
  });

  test('returns 100% icon for 87.5-100%', () => {
    expect(getProgressIcon(87.5)).toBe('\u{F0AA5}'); // 󰪥 — 87.5 rounds to 88 → index 8
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

  test('sub-percent values match displayed text (primary bug fix)', () => {
    // 0.01% displays as "0%" → must show empty icon, not 12.5% bucket
    expect(getProgressIcon(0.01)).toBe('\u{F0130}'); // 󰄰 empty
    expect(getProgressIcon(0.4)).toBe('\u{F0130}');  // rounds to 0 → empty
    // 0.5% displays as "1%" → shows 12.5% bucket icon
    expect(getProgressIcon(0.5)).toBe('\u{F0A9E}');  // 󰪞 12.5%
  });

  test('formula verification: rounds percent before bucketing', () => {
    // Verify icon matches displayed text (both use Math.round)
    const testCases = [
      { percent: 0, expectedIndex: 0 },
      { percent: 0.01, expectedIndex: 0 },   // rounds to 0% → empty icon
      { percent: 0.4, expectedIndex: 0 },    // rounds to 0% → empty icon
      { percent: 0.5, expectedIndex: 1 },    // rounds to 1% → 12.5% icon
      { percent: 12, expectedIndex: 1 },     // rounds to 12% → index 1
      { percent: 12.5, expectedIndex: 2 },   // rounds to 13% → ceil(13/12.5)=2 → 25% icon
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
