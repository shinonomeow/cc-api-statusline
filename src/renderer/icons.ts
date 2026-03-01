/**
 * Nerd-Font Icon Mapping for icon-pct Display Mode
 *
 * Maps usage percentage to progress circle glyphs from nerd-fonts,
 * with a text-based fallback for terminals without nerd fonts.
 */

/**
 * Progress circle glyphs (nerd-fonts)
 * Index 0 = 0% (empty), Index 8 = 100% (full)
 */
const PROGRESS_ICONS = [
  '\u{F0130}', // 󰄰 0% (empty)
  '\u{F0A9E}', // 󰪞 ≤ 12.5%
  '\u{F0A9F}', // 󰪟 ≤ 25%
  '\u{F0AA0}', // 󰪠 ≤ 37.5%
  '\u{F0AA1}', // 󰪡 ≤ 50%
  '\u{F0AA2}', // 󰪢 ≤ 62.5%
  '\u{F0AA3}', // 󰪣 ≤ 75%
  '\u{F0AA4}', // 󰪤 ≤ 87.5%
  '\u{F0AA5}', // 󰪥 ≤ 100% (full)
];

/**
 * Text-based fallback progress icons using standard Unicode geometric shapes.
 * These render in all terminals without nerd fonts.
 * Index 0 = 0%, Index 4 = 100%
 */
const TEXT_PROGRESS_ICONS = [
  '○', // 0%
  '◔', // ≤ 25%
  '◑', // ≤ 50%
  '◕', // ≤ 75%
  '●', // ≤ 100%
];

/**
 * Map a clamped percentage to a bucket index.
 * Rounds percent to integer first so the icon matches the displayed rounded text.
 */
function calcIconIndex(percent: number, bucketSize: number, maxIndex: number): number {
  return Math.min(maxIndex, Math.ceil(Math.round(percent) / bucketSize));
}

/** 9-slot nerd-font icon index (12.5% buckets) */
function calcNerdIconIndex(percent: number): number {
  return calcIconIndex(percent, 12.5, 8);
}

/** 5-slot text fallback icon index (25% buckets) */
function calcTextIconIndex(percent: number): number {
  return calcIconIndex(percent, 25, 4);
}

/**
 * Get progress icon for a given percentage
 *
 * When nerd fonts are available: uses Unicode nerd-font progress circles
 * When not: uses standard Unicode geometric shapes (○◔◑◕●)
 *
 * @param percent - Usage percentage (0-100), or null (returns empty icon)
 * @param nerdFontAvailable - Whether nerd fonts are available (default: true)
 * @returns Progress icon glyph
 */
export function getProgressIcon(percent: number | null, nerdFontAvailable = true): string {
  if (!nerdFontAvailable) {
    // Text-based fallback
    if (percent === null) {
      return TEXT_PROGRESS_ICONS[0] ?? '○';
    }
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const index = calcTextIconIndex(clampedPercent);
    return TEXT_PROGRESS_ICONS[index] ?? TEXT_PROGRESS_ICONS[0] ?? '○';
  }

  // Nerd font icons (original behavior)
  if (percent === null) {
    return PROGRESS_ICONS[0] ?? '';
  }

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const index = calcNerdIconIndex(clampedPercent);
  return PROGRESS_ICONS[index] ?? PROGRESS_ICONS[0] ?? '';
}
