/**
 * Progress Bar Rendering
 *
 * Renders progress bars in various styles with dynamic fill colors.
 * Empty portion always uses dim/muted styling for visual contrast.
 */

import type { BarStyle, BarSize } from '../types/config.js';
import { BUILT_IN_BAR_STYLES, BAR_SIZE_MAP } from '../types/config.js';
import { ansiColor, dimText } from './colors.js';

/**
 * Render a progress bar
 *
 * @param percent - Usage percentage (0-100), or -1 for unlimited (returns empty string)
 * @param size - Bar size (small, medium, large, etc.)
 * @param style - Bar style (named or custom {fill, empty})
 * @param fillColor - Color for filled portion (named ANSI or hex), or null
 * @param emptyColor - Color for empty portion (overrides default dim), or null
 * @returns Rendered bar string with ANSI codes, or empty string if unlimited
 */
export function renderBar(
  percent: number | null,
  size: BarSize,
  style: BarStyle,
  fillColor: string | null,
  emptyColor: string | null
): string {
  // Unlimited balance (-1) → skip bar entirely
  if (percent === -1) {
    return '';
  }

  // Null percent → treat as 0%
  const effectivePercent = percent ?? 0;

  // Clamp to 0-100
  const clampedPercent = Math.max(0, Math.min(100, effectivePercent));

  // Resolve bar size to character count
  const barWidth = BAR_SIZE_MAP[size];

  // Resolve bar style to {fill, empty} characters
  const barChars = resolveBarStyle(style);

  // Special handling for braille style (gradient)
  if (typeof style === 'string' && style === 'braille') {
    return renderBrailleBar(clampedPercent, barWidth, fillColor, emptyColor);
  }

  // Calculate filled and empty character counts
  const filledCount = Math.round((clampedPercent / 100) * barWidth);
  const emptyCount = barWidth - filledCount;

  // Build filled portion (with fill color)
  const filledPart = barChars.fill.repeat(filledCount);
  const coloredFilled = fillColor ? ansiColor(filledPart, fillColor) : filledPart;

  // Build empty portion (always dim/muted)
  const emptyPart = barChars.empty.repeat(emptyCount);
  const coloredEmpty = emptyColor ? ansiColor(emptyPart, emptyColor) : dimText(emptyPart);

  return coloredFilled + coloredEmpty;
}

/**
 * Resolve bar style to {fill, empty} characters
 *
 * @param style - Bar style (named or custom object)
 * @returns {fill, empty} character pair
 */
function resolveBarStyle(style: BarStyle): { fill: string; empty: string } {
  if (typeof style === 'string') {
    return BUILT_IN_BAR_STYLES[style] ?? BUILT_IN_BAR_STYLES.classic;
  }
  return style;
}

/**
 * Render a braille gradient bar
 *
 * Braille style uses a gradient of characters for smoother visual representation.
 * Uses Braille pattern characters U+2800–U+28FF.
 *
 * @param percent - Usage percentage (0-100)
 * @param barWidth - Bar width in characters
 * @param fillColor - Color for filled portion, or null
 * @param emptyColor - Color for empty portion, or null
 * @returns Rendered braille bar
 */
function renderBrailleBar(
  percent: number,
  barWidth: number,
  fillColor: string | null,
  emptyColor: string | null
): string {
  // Braille gradient: empty → partially filled → fully filled
  // Using a simplified gradient for now (can be expanded)
  const brailleChars = ['⣀', '⣄', '⣆', '⣇', '⣧', '⣷', '⣿'];
  const emptyChar = '⣀';
  const fullChar = '⣿';

  // Calculate exact fill position
  const exactFill = (percent / 100) * barWidth;
  const fullCells = Math.floor(exactFill);
  const remainder = exactFill - fullCells;

  let bar = '';

  // Add fully filled cells
  for (let i = 0; i < fullCells; i++) {
    bar += fullChar;
  }

  // Add partial cell (gradient)
  if (fullCells < barWidth && remainder > 0) {
    const gradientIndex = Math.floor(remainder * (brailleChars.length - 1));
    bar += brailleChars[gradientIndex] ?? emptyChar;
  }

  // Add empty cells
  const emptyCells = barWidth - fullCells - (remainder > 0 ? 1 : 0);
  for (let i = 0; i < emptyCells; i++) {
    bar += emptyChar;
  }

  // Apply colors
  // For braille, we apply fill color to all non-empty chars
  // and dim styling to empty chars
  const filledPart = bar.slice(0, fullCells + (remainder > 0 ? 1 : 0));
  const emptyPart = bar.slice(fullCells + (remainder > 0 ? 1 : 0));

  const coloredFilled = fillColor ? ansiColor(filledPart, fillColor) : filledPart;
  const coloredEmpty = emptyColor ? ansiColor(emptyPart, emptyColor) : dimText(emptyPart);

  return coloredFilled + coloredEmpty;
}
