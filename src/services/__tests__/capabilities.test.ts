/**
 * Tests for terminal capability detection
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  detectColorMode,
  resolveColorMode,
  detectNerdFont,
  resolveNerdFont,
  detectCapabilities,
} from '../capabilities.js';

// Save original env
let origEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  origEnv = { ...process.env };
  // Clear all relevant env vars before each test
  delete process.env['NO_COLOR'];
  delete process.env['COLORTERM'];
  delete process.env['TERM_PROGRAM'];
  delete process.env['TERM'];
  delete process.env['CC_STATUSLINE_NERD_FONT'];
});

afterEach(() => {
  // Restore original env - clear all keys first
  for (const key of Object.keys(process.env)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[key];
  }
  Object.assign(process.env, origEnv);
});

describe('detectColorMode', () => {
  test('returns 16 when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    expect(detectColorMode()).toBe('16');
  });

  test('returns 16 when NO_COLOR is empty string', () => {
    process.env['NO_COLOR'] = '';
    // Per NO_COLOR spec: presence disables color (regardless of value)
    expect(detectColorMode()).toBe('16');
  });

  test('returns truecolor when COLORTERM=truecolor', () => {
    process.env['COLORTERM'] = 'truecolor';
    expect(detectColorMode()).toBe('truecolor');
  });

  test('returns truecolor when COLORTERM=24bit', () => {
    process.env['COLORTERM'] = '24bit';
    expect(detectColorMode()).toBe('truecolor');
  });

  test('returns truecolor for iTerm.app', () => {
    process.env['TERM_PROGRAM'] = 'iTerm.app';
    expect(detectColorMode()).toBe('truecolor');
  });

  test('returns truecolor for WezTerm', () => {
    process.env['TERM_PROGRAM'] = 'WezTerm';
    expect(detectColorMode()).toBe('truecolor');
  });

  test('returns truecolor for kitty', () => {
    process.env['TERM_PROGRAM'] = 'kitty';
    expect(detectColorMode()).toBe('truecolor');
  });

  test('returns 256 when TERM includes 256color', () => {
    process.env['TERM'] = 'xterm-256color';
    expect(detectColorMode()).toBe('256');
  });

  test('returns truecolor as default', () => {
    // No env vars set
    expect(detectColorMode()).toBe('truecolor');
  });
});

describe('resolveColorMode', () => {
  test('returns auto-detected mode when undefined', () => {
    // Should not throw and should return a valid mode
    const result = resolveColorMode(undefined);
    expect(['16', '256', 'truecolor']).toContain(result);
  });

  test('returns auto-detected mode when "auto"', () => {
    const result = resolveColorMode('auto');
    expect(['16', '256', 'truecolor']).toContain(result);
  });

  test('returns "16" when configured as "16"', () => {
    expect(resolveColorMode('16')).toBe('16');
  });

  test('returns "256" when configured as "256"', () => {
    expect(resolveColorMode('256')).toBe('256');
  });

  test('returns "truecolor" when configured as "truecolor"', () => {
    expect(resolveColorMode('truecolor')).toBe('truecolor');
  });
});

describe('detectNerdFont', () => {
  test('returns true when CC_STATUSLINE_NERD_FONT=1', () => {
    process.env['CC_STATUSLINE_NERD_FONT'] = '1';
    expect(detectNerdFont()).toBe(true);
  });

  test('returns true when CC_STATUSLINE_NERD_FONT=true', () => {
    process.env['CC_STATUSLINE_NERD_FONT'] = 'true';
    expect(detectNerdFont()).toBe(true);
  });

  test('returns false when CC_STATUSLINE_NERD_FONT=0', () => {
    process.env['CC_STATUSLINE_NERD_FONT'] = '0';
    expect(detectNerdFont()).toBe(false);
  });

  test('returns false when CC_STATUSLINE_NERD_FONT=false', () => {
    process.env['CC_STATUSLINE_NERD_FONT'] = 'false';
    expect(detectNerdFont()).toBe(false);
  });

  test('returns true for iTerm.app', () => {
    process.env['TERM_PROGRAM'] = 'iTerm.app';
    expect(detectNerdFont()).toBe(true);
  });

  test('returns true for vscode', () => {
    process.env['TERM_PROGRAM'] = 'vscode';
    expect(detectNerdFont()).toBe(true);
  });

  test('returns true as default (assume developer terminal)', () => {
    expect(detectNerdFont()).toBe(true);
  });
});

describe('resolveNerdFont', () => {
  test('returns true when configured as true', () => {
    expect(resolveNerdFont(true)).toBe(true);
  });

  test('returns false when configured as false', () => {
    expect(resolveNerdFont(false)).toBe(false);
  });

  test('auto-detects when configured as "auto"', () => {
    const result = resolveNerdFont('auto');
    expect(typeof result).toBe('boolean');
  });

  test('auto-detects when undefined', () => {
    const result = resolveNerdFont(undefined);
    expect(typeof result).toBe('boolean');
  });
});

describe('detectCapabilities', () => {
  test('returns object with colorMode and nerdFontLikely', () => {
    const caps = detectCapabilities();
    expect(['16', '256', 'truecolor']).toContain(caps.colorMode);
    expect(typeof caps.nerdFontLikely).toBe('boolean');
  });
});
