/**
 * Render Context
 *
 * Runtime-resolved rendering context, created once per render cycle.
 * Encapsulates terminal capabilities and piped mode state.
 */

import type { Config } from '../types/config.js';
import { resolveColorMode, resolveNerdFont } from '../services/capabilities.js';

/**
 * Resolved render context for a single render pass
 */
export interface RenderContext {
  colorMode: '16' | '256' | 'truecolor';
  nerdFontAvailable: boolean;
  isPiped: boolean;
}

/**
 * Create a render context from config and runtime state
 *
 * @param config - Full configuration
 * @param isPiped - Whether running in piped mode
 * @returns Resolved render context
 */
export function createRenderContext(config: Config, isPiped: boolean): RenderContext {
  return {
    colorMode: resolveColorMode(config.display.colorMode),
    nerdFontAvailable: resolveNerdFont(config.display.nerdFont),
    isPiped,
  };
}
