/**
 * Nerd-Font Icon Mapping for icon-pct Display Mode
 *
 * Maps usage percentage to progress circle glyphs from nerd-fonts.
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
 * Get progress icon for a given percentage
 *
 * Formula: index = Math.min(8, Math.ceil(percentage / 12.5))
 *
 * @param percent - Usage percentage (0-100), or null (returns empty icon)
 * @returns Progress circle glyph
 */
export function getProgressIcon(percent: number | null): string {
  // Null percent → empty icon
  if (percent === null) {
    return PROGRESS_ICONS[0] ?? '';
  }

  // Clamp to 0-100
  const clampedPercent = Math.max(0, Math.min(100, percent));

  // Calculate icon index
  const index = Math.min(8, Math.ceil(clampedPercent / 12.5));

  return PROGRESS_ICONS[index] ?? PROGRESS_ICONS[0] ?? '';
}
