/**
 * Color Utilities — ANSI color codes, hex conversion, and dynamic color resolution
 *
 * Supports:
 * - Named ANSI colors (16 standard terminal colors)
 * - Hex colors (3-digit and 6-digit)
 * - Dynamic color aliases that resolve based on usage percentage
 */

import type { Config, ColorAliasEntry, ColorTieredEntry } from '../types/config.js';
import type { TerminalCapabilities } from '../services/capabilities.js';

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
 * Named theme colors (hex-based) for use in configs
 * These resolve to hex colors and get rendered as truecolor ANSI
 */
const THEME_COLORS: Record<string, string> = {
  cool: '#56B6C2',
  comfortable: '#6BAF8D',
  warm: '#C9A84C',
  hot: '#CB7E55',
  critical: '#C96B6B',

  // Pastel theme colors (soft, gentle)
  'pastel-cool': '#BAD7F2',        // pale-sky
  'pastel-comfortable': '#BAF2D8', // celadon-2
  'pastel-medium': '#BAF2BB',      // celadon
  'pastel-warm': '#F2E2BA',        // pearl-beige
  'pastel-hot': '#F2BAC9',         // soft-blossom

  // Bright theme colors (vibrant pastels)
  'bright-cool': '#90F1EF',        // soft-cyan
  'bright-comfortable': '#7BF1A8', // light-green-2
  'bright-medium': '#C1FBA4',      // light-green
  'bright-warm': '#FFEF9F',        // light-gold
  'bright-hot': '#FFD6E0',         // petal-frost

  // Ocean theme colors (deep blues to coral)
  'ocean-cool': '#0081A7',         // cerulean
  'ocean-comfortable': '#00AFB9',  // tropical-teal
  'ocean-medium': '#FDFCDC',       // light-yellow
  'ocean-warm': '#FED9B7',         // soft-apricot
  'ocean-hot': '#F07167',          // vibrant-coral

  // Neutral theme colors (muted neutrals)
  'neutral-cool': '#D8E2DC',
  'neutral-comfortable': '#FFE5D9',
  'neutral-warm': '#FFCAD4',
  'neutral-hot': '#F4ACB7',
  'neutral-critical': '#9D8189',
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
 * Apply ANSI color to text using the specified color mode
 *
 * @param text - Text to colorize
 * @param color - Named ANSI color, hex (#rgb or #rrggbb), or null (no-op)
 * @param capabilities - Optional terminal capabilities (for color mode selection)
 * @returns Colorized text with ANSI codes
 */
export function ansiColor(
  text: string,
  color: string | null | undefined,
  capabilities?: Pick<TerminalCapabilities, 'colorMode'>
): string {
  if (!color) return text;

  // Theme color name — resolve to hex and recurse
  const themeHex = THEME_COLORS[color.toLowerCase()];
  if (themeHex) {
    return ansiColor(text, themeHex, capabilities);
  }

  // Named ANSI color (always 16-color codes — works in all modes)
  if (ANSI_COLORS[color.toLowerCase()]) {
    return `${ANSI_COLORS[color.toLowerCase()]}${text}${ANSI_RESET}`;
  }

  // Hex color — render based on color mode
  if (color.startsWith('#')) {
    const colorMode = capabilities?.colorMode ?? 'truecolor';

    if (colorMode === '16') {
      // 16-color mode: convert to nearest named ANSI color
      const named = hexToNearestNamedAnsi(color);
      return named ? `${named}${text}${ANSI_RESET}` : text;
    }

    if (colorMode === '256') {
      // 256-color mode: use color cube index
      const index = hexTo256(color);
      if (index !== null) {
        return `\x1b[38;5;${index}m${text}${ANSI_RESET}`;
      }
      return text;
    }

    // truecolor (default)
    const rgb = hexToRgb(color);
    if (rgb) {
      return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}${ANSI_RESET}`;
    }
  }

  // Unknown color — treat as no-op
  return text;
}

/**
 * Convert hex color to 256-color index (color cube, indices 16-231)
 *
 * @param hex - Hex color string (#rgb or #rrggbb)
 * @returns 256-color index or null if invalid
 */
export function hexTo256(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  // Standard 6x6x6 color cube (indices 16-231)
  const r6 = Math.round((rgb.r / 255) * 5);
  const g6 = Math.round((rgb.g / 255) * 5);
  const b6 = Math.round((rgb.b / 255) * 5);
  return 16 + 36 * r6 + 6 * g6 + b6;
}

/**
 * Map of basic ANSI named colors to approximate RGB values (for fallback)
 */
const ANSI_COLOR_RGB: Array<{ name: string; r: number; g: number; b: number }> = [
  { name: 'black', r: 0, g: 0, b: 0 },
  { name: 'red', r: 170, g: 0, b: 0 },
  { name: 'green', r: 0, g: 170, b: 0 },
  { name: 'yellow', r: 170, g: 170, b: 0 },
  { name: 'blue', r: 0, g: 0, b: 170 },
  { name: 'magenta', r: 170, g: 0, b: 170 },
  { name: 'cyan', r: 0, g: 170, b: 170 },
  { name: 'white', r: 170, g: 170, b: 170 },
];

/**
 * Convert hex color to nearest named ANSI color (for 16-color fallback)
 *
 * @param hex - Hex color string
 * @returns ANSI escape code for nearest named color, or null
 */
function hexToNearestNamedAnsi(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let minDist = Infinity;
  let nearest = 'white';

  for (const entry of ANSI_COLOR_RGB) {
    const dr = rgb.r - entry.r;
    const dg = rgb.g - entry.g;
    const db = rgb.b - entry.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      nearest = entry.name;
    }
  }

  return ANSI_COLORS[nearest] ?? null;
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
/**
 * Type guard to check if alias is tiered entry
 */
function isTieredEntry(alias: ColorAliasEntry): alias is ColorTieredEntry {
  return 'tiers' in alias;
}

/**
 * Resolve tiered color based on usage percentage
 */
function resolveTieredColor(
  entry: ColorTieredEntry,
  usagePercent: number | null
): string | null {
  if (entry.tiers.length === 0) return null;

  // No usage data → default to first tier
  if (usagePercent === null) {
    return entry.tiers[0]?.color ?? null;
  }

  // Find first tier where usage < maxPercent
  for (const tier of entry.tiers) {
    if (usagePercent < tier.maxPercent) {
      return tier.color;
    }
  }

  // If no tier matched (usage >= all maxPercents), return last tier
  return entry.tiers[entry.tiers.length - 1]?.color ?? null;
}

function resolveColorAlias(
  alias: ColorAliasEntry | undefined,
  usagePercent: number | null
): string | null {
  if (!alias) return null;

  // Check if it's a tiered entry first
  if (isTieredEntry(alias)) {
    return resolveTieredColor(alias, usagePercent);
  }

  // Legacy format (3-tier)
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
