/**
 * Color Utilities — ANSI color codes, hex conversion, and dynamic color resolution
 *
 * Supports:
 * - Named ANSI colors (16 standard terminal colors)
 * - Hex colors (3-digit and 6-digit)
 * - Dynamic color aliases that resolve based on usage percentage
 */

import type { Config, ColorAliasEntry } from '../types/config.js';

/**
 * Standard ANSI color codes (foreground)
 */
const ANSI_COLORS: Record<string, string> = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright variants
  'bright-black': '\x1b[90m',
  'bright-red': '\x1b[91m',
  'bright-green': '\x1b[92m',
  'bright-yellow': '\x1b[93m',
  'bright-blue': '\x1b[94m',
  'bright-magenta': '\x1b[95m',
  'bright-cyan': '\x1b[96m',
  'bright-white': '\x1b[97m',
  // Aliases
  gray: '\x1b[90m',
  grey: '\x1b[90m',
};

/**
 * ANSI reset code
 */
const ANSI_RESET = '\x1b[0m';

/**
 * ANSI dim/muted code
 */
const ANSI_DIM = '\x1b[2m';

/**
 * Apply ANSI color to text
 *
 * @param text - Text to colorize
 * @param color - Named ANSI color, hex (#rgb or #rrggbb), or null (no-op)
 * @returns Colorized text with ANSI codes
 */
export function ansiColor(text: string, color: string | null | undefined): string {
  if (!color) return text;

  // Named ANSI color
  if (ANSI_COLORS[color.toLowerCase()]) {
    return `${ANSI_COLORS[color.toLowerCase()]}${text}${ANSI_RESET}`;
  }

  // Hex color
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (rgb) {
      return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}${ANSI_RESET}`;
    }
  }

  // Unknown color — treat as no-op
  return text;
}

/**
 * Convert hex color to RGB
 *
 * @param hex - Hex color string (#rgb or #rrggbb)
 * @returns RGB object or null if invalid
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # prefix
  const cleanHex = hex.replace(/^#/, '');

  // 3-digit shorthand (#rgb → #rrggbb)
  if (cleanHex.length === 3) {
    const [r, g, b] = cleanHex.split('').map((c) => parseInt(c + c, 16));
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }

  // 6-digit full hex (#rrggbb)
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }

  return null;
}

/**
 * Convert hex color to ANSI RGB escape code
 *
 * @param hex - Hex color string (#rgb or #rrggbb)
 * @returns ANSI RGB code or null if invalid
 */
export function hexToAnsi(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

/**
 * Apply dim/muted styling to text
 *
 * @param text - Text to dim
 * @returns Dimmed text with ANSI codes
 */
export function dimText(text: string): string {
  return `${ANSI_DIM}${text}${ANSI_RESET}`;
}

/**
 * Strip ANSI escape codes from text
 *
 * @param text - Text with ANSI codes
 * @returns Plain text without ANSI codes
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Resolve color name to actual color based on usage percentage
 *
 * Handles:
 * - Alias names ("auto", custom aliases) → resolve dynamically from usage %
 * - Named ANSI or hex colors → return as-is
 * - null/undefined → default to "auto"
 *
 * @param colorName - Color name, alias, hex, or null
 * @param usagePercent - Usage percentage (0-100), or null for non-percentage components
 * @param config - Full configuration (for color aliases)
 * @returns Resolved color string (named ANSI or hex), or null
 */
export function resolveColor(
  colorName: string | null | undefined,
  usagePercent: number | null,
  config: Config
): string | null {
  // Default to "auto" if not specified
  const effectiveColor = colorName ?? 'auto';

  // If it's a hex or named ANSI color, return as-is
  if (effectiveColor.startsWith('#') || ANSI_COLORS[effectiveColor.toLowerCase()]) {
    return effectiveColor;
  }

  // Otherwise, it's an alias — resolve dynamically
  const alias = config.colors?.[effectiveColor];

  if (!alias) {
    // Unknown alias — fall back to "auto"
    const autoAlias = config.colors?.auto;
    // If "auto" is a string (direct color), return it
    if (typeof autoAlias === 'string') {
      return autoAlias;
    }
    // If "auto" is a ColorAliasEntry, resolve it
    return resolveColorAlias(autoAlias, usagePercent);
  }

  // If alias is a string (direct color), return it
  if (typeof alias === 'string') {
    return alias;
  }

  // Alias is a ColorAliasEntry — resolve based on usage %
  return resolveColorAlias(alias, usagePercent);
}

/**
 * Resolve a color alias entry to a color based on usage percentage
 *
 * @param alias - Color alias entry with thresholds
 * @param usagePercent - Usage percentage (0-100), or null for default "low" color
 * @returns Resolved color string
 */
function resolveColorAlias(
  alias: ColorAliasEntry | undefined,
  usagePercent: number | null
): string | null {
  if (!alias) return null;

  // No usage data → default to "low" color
  if (usagePercent === null) {
    return alias.low;
  }

  // Resolve based on thresholds
  if (usagePercent < alias.lowThreshold) {
    return alias.low;
  } else if (usagePercent < alias.highThreshold) {
    return alias.medium;
  } else {
    return alias.high;
  }
}
