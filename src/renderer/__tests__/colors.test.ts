/**
 * Tests for color utilities
 */

import { describe, test, expect } from 'vitest';
import { ansiColor, hexToAnsi, dimText, stripAnsi, resolveColor } from '../colors.js';
import { DEFAULT_CONFIG, type Config } from '../../types/config.js';

describe('ansiColor', () => {
  test('applies named ANSI colors', () => {
    expect(ansiColor('test', 'red')).toBe('\x1b[31mtest\x1b[0m');
    expect(ansiColor('test', 'green')).toBe('\x1b[32mtest\x1b[0m');
    expect(ansiColor('test', 'cyan')).toBe('\x1b[36mtest\x1b[0m');
  });

  test('handles bright colors', () => {
    expect(ansiColor('test', 'bright-red')).toBe('\x1b[91mtest\x1b[0m');
    expect(ansiColor('test', 'bright-green')).toBe('\x1b[92mtest\x1b[0m');
  });

  test('handles case-insensitive color names', () => {
    expect(ansiColor('test', 'RED')).toBe('\x1b[31mtest\x1b[0m');
    expect(ansiColor('test', 'Green')).toBe('\x1b[32mtest\x1b[0m');
  });

  test('applies hex colors (6-digit)', () => {
    const result = ansiColor('test', '#ff5500');
    expect(result).toBe('\x1b[38;2;255;85;0mtest\x1b[0m');
  });

  test('applies hex colors (3-digit shorthand)', () => {
    const result = ansiColor('test', '#f50');
    expect(result).toBe('\x1b[38;2;255;85;0mtest\x1b[0m');
  });

  test('returns text unchanged for null/undefined color', () => {
    expect(ansiColor('test', null)).toBe('test');
    expect(ansiColor('test', undefined)).toBe('test');
  });

  test('returns text unchanged for unknown color', () => {
    expect(ansiColor('test', 'unknown')).toBe('test');
  });
});

describe('hexToAnsi', () => {
  test('converts 6-digit hex to ANSI RGB', () => {
    expect(hexToAnsi('#ff5500')).toBe('\x1b[38;2;255;85;0m');
    expect(hexToAnsi('#000000')).toBe('\x1b[38;2;0;0;0m');
    expect(hexToAnsi('#ffffff')).toBe('\x1b[38;2;255;255;255m');
  });

  test('converts 3-digit hex shorthand to ANSI RGB', () => {
    expect(hexToAnsi('#f50')).toBe('\x1b[38;2;255;85;0m');
    expect(hexToAnsi('#000')).toBe('\x1b[38;2;0;0;0m');
    expect(hexToAnsi('#fff')).toBe('\x1b[38;2;255;255;255m');
  });

  test('returns null for invalid hex', () => {
    expect(hexToAnsi('#')).toBeNull();
    expect(hexToAnsi('#12')).toBeNull();
    expect(hexToAnsi('#1234')).toBeNull();
    expect(hexToAnsi('#gggggg')).toBeNull();
    expect(hexToAnsi('not-hex')).toBeNull();
  });
});

describe('dimText', () => {
  test('applies dim ANSI styling', () => {
    expect(dimText('test')).toBe('\x1b[2mtest\x1b[0m');
  });
});

describe('stripAnsi', () => {
  test('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    expect(stripAnsi('\x1b[38;2;255;85;0mtext\x1b[0m')).toBe('text');
    expect(stripAnsi('\x1b[2mdim\x1b[0m')).toBe('dim');
  });

  test('handles mixed ANSI codes', () => {
    const input = '\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m';
    expect(stripAnsi(input)).toBe('red and green');
  });

  test('returns text unchanged if no ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('resolveColor', () => {
  const testConfig: Config = {
    ...DEFAULT_CONFIG,
    colors: {
      auto: {
        low: 'green',
        medium: 'yellow',
        high: 'red',
        lowThreshold: 50,
        highThreshold: 80,
      },
      chill: {
        low: 'cyan',
        medium: 'blue',
        high: 'magenta',
        lowThreshold: 50,
        highThreshold: 80,
      },
      direct: 'purple',
    },
  };

  describe('"auto" alias resolution', () => {
    test('resolves to low color at 0%', () => {
      expect(resolveColor('auto', 0, testConfig)).toBe('green');
    });

    test('resolves to low color at 49%', () => {
      expect(resolveColor('auto', 49, testConfig)).toBe('green');
    });

    test('resolves to medium color at 50%', () => {
      expect(resolveColor('auto', 50, testConfig)).toBe('yellow');
    });

    test('resolves to medium color at 79%', () => {
      expect(resolveColor('auto', 79, testConfig)).toBe('yellow');
    });

    test('resolves to high color at 80%', () => {
      expect(resolveColor('auto', 80, testConfig)).toBe('red');
    });

    test('resolves to high color at 100%', () => {
      expect(resolveColor('auto', 100, testConfig)).toBe('red');
    });
  });

  describe('custom alias resolution', () => {
    test('resolves custom alias "chill" based on usage', () => {
      expect(resolveColor('chill', 0, testConfig)).toBe('cyan');
      expect(resolveColor('chill', 50, testConfig)).toBe('blue');
      expect(resolveColor('chill', 80, testConfig)).toBe('magenta');
    });

    test('resolves direct color alias', () => {
      expect(resolveColor('direct', 50, testConfig)).toBe('purple');
    });
  });

  describe('null/undefined handling', () => {
    test('defaults to "auto" if color is null', () => {
      expect(resolveColor(null, 10, testConfig)).toBe('green');
      expect(resolveColor(null, 60, testConfig)).toBe('yellow');
    });

    test('defaults to "auto" if color is undefined', () => {
      expect(resolveColor(undefined, 10, testConfig)).toBe('green');
      expect(resolveColor(undefined, 85, testConfig)).toBe('red');
    });

    test('returns low color if usagePercent is null', () => {
      expect(resolveColor('auto', null, testConfig)).toBe('green');
      expect(resolveColor('chill', null, testConfig)).toBe('cyan');
    });
  });

  describe('direct color pass-through', () => {
    test('returns hex colors as-is', () => {
      expect(resolveColor('#ff5500', 50, testConfig)).toBe('#ff5500');
      expect(resolveColor('#f50', 80, testConfig)).toBe('#f50');
    });

    test('returns named ANSI colors as-is', () => {
      expect(resolveColor('red', 50, testConfig)).toBe('red');
      expect(resolveColor('cyan', 80, testConfig)).toBe('cyan');
    });
  });

  describe('unknown alias fallback', () => {
    test('falls back to "auto" for unknown alias', () => {
      expect(resolveColor('unknown-alias', 10, testConfig)).toBe('green');
      expect(resolveColor('unknown-alias', 60, testConfig)).toBe('yellow');
      expect(resolveColor('unknown-alias', 90, testConfig)).toBe('red');
    });

    test('handles string "auto" alias (valid by type)', () => {
      const configWithStringAuto: Config = {
        ...DEFAULT_CONFIG,
        colors: {
          auto: 'cyan', // string instead of ColorAliasEntry
        },
      };
      // Unknown alias should fall back to string "auto"
      expect(resolveColor('unknown-alias', 50, configWithStringAuto)).toBe('cyan');
    });
  });
});
