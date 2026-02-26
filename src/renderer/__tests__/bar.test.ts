/**
 * Tests for progress bar rendering
 */

import { describe, test, expect } from 'vitest';
import { renderBar } from '../bar.js';
import { stripAnsi } from '../colors.js';

describe('renderBar', () => {
  describe('basic rendering', () => {
    test('renders 0% as all empty', () => {
      const bar = renderBar(0, 'medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('────────'); // 8 empty chars
    });

    test('renders 50% as half filled', () => {
      const bar = renderBar(50, 'medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('━━━━────'); // 4 filled + 4 empty
    });

    test('renders 100% as all filled', () => {
      const bar = renderBar(100, 'medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('━━━━━━━━'); // 8 filled chars
    });

    test('handles null percent as 0%', () => {
      const bar = renderBar(null, 'medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('────────');
    });

    test('returns empty string for unlimited (-1)', () => {
      const bar = renderBar(-1, 'medium', 'classic', null, null);
      expect(bar).toBe('');
    });
  });

  describe('bar sizes', () => {
    test('renders small bar (4 chars)', () => {
      const bar = renderBar(50, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('━━──'); // 2 filled + 2 empty
      expect(plain.length).toBe(4);
    });

    test('renders small-medium bar (6 chars)', () => {
      const bar = renderBar(50, 'small-medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain.length).toBe(6);
    });

    test('renders medium bar (8 chars)', () => {
      const bar = renderBar(50, 'medium', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain.length).toBe(8);
    });

    test('renders medium-large bar (10 chars)', () => {
      const bar = renderBar(50, 'medium-large', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain.length).toBe(10);
    });

    test('renders large bar (12 chars)', () => {
      const bar = renderBar(50, 'large', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain.length).toBe(12);
    });
  });

  describe('bar styles', () => {
    test('renders classic style', () => {
      const bar = renderBar(50, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('━━──');
    });

    test('renders block style', () => {
      const bar = renderBar(50, 'small', 'block', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('██░░');
    });

    test('renders shade style', () => {
      const bar = renderBar(50, 'small', 'shade', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('▓▓░░');
    });

    test('renders pipe style', () => {
      const bar = renderBar(50, 'small', 'pipe', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('┃┃┊┊');
    });

    test('renders dot style', () => {
      const bar = renderBar(50, 'small', 'dot', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('●●○○');
    });

    test('renders square style', () => {
      const bar = renderBar(50, 'small', 'square', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('■■□□');
    });

    test('renders star style', () => {
      const bar = renderBar(50, 'small', 'star', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('★★☆☆');
    });

    test('renders braille style', () => {
      const bar = renderBar(50, 'small', 'braille', null, null);
      const plain = stripAnsi(bar);
      // Braille uses gradient characters
      expect(plain.length).toBe(4);
      expect(plain).toContain('⣿'); // Should contain some filled braille chars
    });

    test('renders custom style', () => {
      const bar = renderBar(50, 'small', { fill: '▰', empty: '▱' }, null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('▰▰▱▱');
    });
  });

  describe('color application', () => {
    test('applies fill color', () => {
      const bar = renderBar(50, 'small', 'classic', 'red', null);
      expect(bar).toContain('\x1b[31m'); // Red ANSI code
      expect(bar).toContain('━━'); // Filled chars
    });

    test('applies empty color (overrides default dim)', () => {
      const bar = renderBar(50, 'small', 'classic', null, 'gray');
      expect(bar).toContain('\x1b[90m'); // Gray ANSI code
      expect(bar).toContain('──'); // Empty chars
    });

    test('applies both fill and empty colors', () => {
      const bar = renderBar(50, 'small', 'classic', 'green', 'gray');
      expect(bar).toContain('\x1b[32m'); // Green for fill
      expect(bar).toContain('\x1b[90m'); // Gray for empty
    });

    test('applies dim to empty chars by default', () => {
      const bar = renderBar(50, 'small', 'classic', null, null);
      expect(bar).toContain('\x1b[2m'); // Dim ANSI code
    });
  });

  describe('edge cases', () => {
    test('clamps negative percent to 0', () => {
      const bar = renderBar(-50, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('────');
    });

    test('clamps percent > 100 to 100', () => {
      const bar = renderBar(150, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      expect(plain).toBe('━━━━');
    });

    test('rounds to nearest character', () => {
      // 25% of 8 chars = 2 chars
      const bar1 = renderBar(25, 'medium', 'classic', null, null);
      const plain1 = stripAnsi(bar1);
      expect(plain1).toBe('━━──────');

      // 75% of 8 chars = 6 chars
      const bar2 = renderBar(75, 'medium', 'classic', null, null);
      const plain2 = stripAnsi(bar2);
      expect(plain2).toBe('━━━━━━──');
    });

    test('handles 1% on small bar', () => {
      const bar = renderBar(1, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      // 1% of 4 chars = 0.04 chars, rounds to 0
      expect(plain).toBe('────');
    });

    test('handles 99% on small bar', () => {
      const bar = renderBar(99, 'small', 'classic', null, null);
      const plain = stripAnsi(bar);
      // 99% of 4 chars = 3.96 chars, rounds to 4
      expect(plain).toBe('━━━━');
    });
  });

  describe('braille gradient', () => {
    test('renders smooth transition at various percentages', () => {
      const bar0 = renderBar(0, 'small', 'braille', null, null);
      const bar25 = renderBar(25, 'small', 'braille', null, null);
      const bar50 = renderBar(50, 'small', 'braille', null, null);
      const bar75 = renderBar(75, 'small', 'braille', null, null);
      const bar100 = renderBar(100, 'small', 'braille', null, null);

      // All should have length 4
      expect(stripAnsi(bar0).length).toBe(4);
      expect(stripAnsi(bar25).length).toBe(4);
      expect(stripAnsi(bar50).length).toBe(4);
      expect(stripAnsi(bar75).length).toBe(4);
      expect(stripAnsi(bar100).length).toBe(4);

      // 0% should be all empty
      expect(stripAnsi(bar0)).toBe('⣀⣀⣀⣀');

      // 100% should be all filled
      expect(stripAnsi(bar100)).toBe('⣿⣿⣿⣿');

      // Intermediate values should have gradient
      const plain50 = stripAnsi(bar50);
      expect(plain50).toMatch(/[⣀⣄⣆⣇⣧⣷⣿]+/);
    });
  });
});
