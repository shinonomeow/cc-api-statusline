/**
 * Terminal Width & ANSI-Aware Truncation
 *
 * Handles terminal width detection, visible length calculation (excluding ANSI escapes),
 * and truncation with ellipsis suffix.
 */

/**
 * Get terminal width
 *
 * In piped mode (ccstatusline uses execSync with stdio: ['pipe', 'pipe', 'ignore']),
 * process.stdout.columns is unreliable (often undefined). Fall back to 200 chars.
 *
 * In standalone mode, process.stdout.columns is authoritative.
 *
 * @returns Terminal width in characters
 */
export function getTerminalWidth(): number {
  // If stdout.columns is defined and > 0, use it
  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  // Check for CC_STATUSLINE_COLS override
  const colsOverride = process.env['CC_STATUSLINE_COLS'];
  if (colsOverride) {
    const parsed = parseInt(colsOverride, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  // Piped mode fallback: generous default for modern terminals
  return 200;
}

/**
 * Compute max width from terminal width and percentage
 *
 * @param termWidth - Terminal width in characters
 * @param maxWidthPct - Max width percentage (20-100)
 * @returns Max width in characters
 */
export function computeMaxWidth(termWidth: number, maxWidthPct: number): number {
  // Clamp percentage to 20-100
  const pct = Math.max(20, Math.min(100, maxWidthPct));
  return Math.floor((termWidth * pct) / 100);
}

/**
 * Calculate visible length of text (excluding ANSI escape sequences)
 *
 * @param text - Text with potential ANSI codes
 * @returns Visible character count
 */
export function visibleLength(text: string): number {
  // Strip ANSI escape sequences: \x1b[...m
  // Pattern: ESC [ (any non-letter chars) letter
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  return stripped.length;
}

/**
 * ANSI-aware truncation with ellipsis suffix
 *
 * Truncates text to maxWidth visible characters. If truncated, appends '…'.
 * Preserves ANSI codes up to the truncation point.
 *
 * @param text - Text to truncate
 * @param maxWidth - Max visible width in characters
 * @returns Truncated text with ANSI codes preserved
 */
export function ansiAwareTruncate(text: string, maxWidth: number): string {
  const visible = visibleLength(text);

  // No truncation needed
  if (visible <= maxWidth) {
    return text;
  }

  // Reserve 1 char for ellipsis
  const targetWidth = maxWidth - 1;

  // Walk through text, tracking visible chars and collecting output
  let output = '';
  let visibleCount = 0;
  let i = 0;

  while (i < text.length && visibleCount < targetWidth) {
    // Check for ANSI escape sequence
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      // Find the end of the escape sequence (letter after digits/semicolons)
      const escapeStart = i;
      i += 2; // Skip ESC [
      while (i < text.length && text[i] !== undefined && /[0-9;]/.test(text[i])) {
        i++;
      }
      if (i < text.length) {
        i++; // Skip the terminating letter
      }
      // Add the entire escape sequence to output (doesn't count as visible)
      output += text.slice(escapeStart, i);
    } else {
      // Regular character
      const char = text[i];
      if (char !== undefined) {
        output += char;
      }
      visibleCount++;
      i++;
    }
  }

  // Append ellipsis
  return output + '…';
}

/**
 * Component drop priority (lowest priority first)
 *
 * When pre-render width estimation determines components won't fit,
 * drop them in this order.
 */
export const COMPONENT_DROP_PRIORITY = [
  'plan',
  'tokens',
  'rateLimit',
  'monthly',
  'countdown', // All countdown sub-components
  'weekly',
  'daily',
  'balance',
] as const;
