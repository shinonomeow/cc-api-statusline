/**
 * Divider Rendering
 *
 * Renders configurable dividers between statusline components.
 * Supports text, padding, and color options.
 */

import type { DividerConfig } from '../types/config.js';
import { ansiColor } from './colors.js';

/**
 * Render a divider string from a DividerConfig
 *
 * @param divider - Divider configuration
 * @returns Rendered divider string
 */
export function renderDivider(divider: DividerConfig): string {
  const text = divider.text ?? '|';
  const padding = divider.padding ?? 1;
  const pad = ' '.repeat(padding);
  const padded = `${pad}${text}${pad}`;
  // Default to cc-statusline's brightBlack color (#555753)
  return ansiColor(padded, divider.color ?? '#555753');
}
