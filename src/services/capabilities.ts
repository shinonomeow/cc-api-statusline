/**
 * Terminal Capability Detection
 *
 * Pure functions for detecting terminal color support and nerd font availability.
 * Used by Plans A (color mode) and E (nerd font detection).
 */

import type { ColorMode } from '../types/config.js';

/**
 * Nerd font setting type
 */
export type NerdFontSetting = 'auto' | true | false;

/**
 * Resolved terminal capabilities
 */
export interface TerminalCapabilities {
  colorMode: '16' | '256' | 'truecolor';
  nerdFontLikely: boolean;
}

/**
 * Known truecolor-capable terminal programs
 */
const TRUECOLOR_TERMINALS = ['iTerm.app', 'WezTerm', 'Alacritty', 'kitty', 'Hyper', 'vscode'];

/**
 * Known nerd-font-friendly terminal programs
 */
const NERD_TERMINALS = ['iTerm.app', 'WezTerm', 'Alacritty', 'kitty', 'Hyper'];

/**
 * Detect the color mode supported by the current terminal
 *
 * Priority:
 * 1. NO_COLOR → 16-color (disable all color)
 * 2. COLORTERM=truecolor|24bit → truecolor
 * 3. Known truecolor terminals → truecolor
 * 4. TERM contains "256color" → 256-color
 * 5. Default → truecolor (most modern dev terminals support it)
 */
export function detectColorMode(): '16' | '256' | 'truecolor' {
  // NO_COLOR spec: disable all color
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') {
    return '16';
  }

  // Explicit truecolor indicators
  const colorterm = process.env['COLORTERM'] ?? '';
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    return 'truecolor';
  }

  // Known truecolor-capable terminals
  const termProgram = process.env['TERM_PROGRAM'] ?? '';
  if (TRUECOLOR_TERMINALS.some((t) => termProgram.includes(t))) {
    return 'truecolor';
  }

  // TERM hint for 256-color
  const term = process.env['TERM'] ?? '';
  if (term.includes('256color')) {
    return '256';
  }

  // Default: most modern dev terminals support truecolor
  return 'truecolor';
}

/**
 * Resolve color mode from configured value (or detect automatically)
 *
 * @param configured - Configured color mode (or 'auto' for detection)
 * @returns Resolved concrete color mode
 */
export function resolveColorMode(configured: ColorMode | undefined): '16' | '256' | 'truecolor' {
  if (!configured || configured === 'auto') {
    return detectColorMode();
  }
  return configured;
}

/**
 * Detect whether nerd fonts are likely available in the current terminal
 *
 * Priority:
 * 1. CC_STATUSLINE_NERD_FONT env var → explicit override
 * 2. Known nerd-font-friendly terminals → true
 * 3. VSCode integrated terminal → true
 * 4. Default → true (assume developer terminals have nerd fonts)
 */
export function detectNerdFont(): boolean {
  // Explicit override via env var
  const override = process.env['CC_STATUSLINE_NERD_FONT'];
  if (override === '1' || override === 'true') return true;
  if (override === '0' || override === 'false') return false;

  // Known nerd-font-friendly terminals
  const termProgram = process.env['TERM_PROGRAM'] ?? '';
  if (NERD_TERMINALS.some((t) => termProgram.includes(t))) return true;

  // VSCode integrated terminal
  if (termProgram === 'vscode') return true;

  // Default: assume likely for developer terminals
  return true;
}

/**
 * Resolve nerd font availability from configured setting
 *
 * @param configured - Configured nerd font setting
 * @returns Whether nerd fonts are available
 */
export function resolveNerdFont(configured: NerdFontSetting | undefined): boolean {
  if (configured === true) return true;
  if (configured === false) return false;
  return detectNerdFont();
}

/**
 * Detect all terminal capabilities at once
 *
 * @returns Resolved terminal capabilities
 */
export function detectCapabilities(): TerminalCapabilities {
  return {
    colorMode: detectColorMode(),
    nerdFontLikely: detectNerdFont(),
  };
}
