/**
 * Main Rendering Pipeline
 *
 * Orchestrates the full statusline rendering: component order, filtering,
 * joining, error indicators, and truncation.
 */

import type { Config } from '../types/config.js';
import type { NormalizedUsage } from '../types/normalized-usage.js';
import type { ErrorState } from './error.js';
import { renderComponent, type ComponentId } from './component.js';
import { renderError } from './error.js';
import {
  getTerminalWidth,
  computeMaxWidth,
  ansiAwareTruncate,
} from './truncate.js';

/**
 * Default component render order (when not specified in config)
 */
const DEFAULT_COMPONENT_ORDER: ComponentId[] = [
  'daily',
  'weekly',
  'monthly',
  'balance',
  'tokens',
  'rateLimit',
  'plan',
];

/**
 * Render full statusline
 *
 * @param data - Normalized usage data
 * @param config - Full configuration
 * @param errorState - Optional error state to display
 * @param cacheAge - Age of cached data in minutes (for staleness indicator)
 * @returns Rendered statusline string
 */
export function renderStatusline(
  data: NormalizedUsage,
  config: Config,
  errorState?: ErrorState,
  cacheAge?: number
): string {
  // Determine component render order
  const componentOrder = getComponentOrder(config);

  // Render each enabled component
  const renderedComponents: string[] = [];
  for (const componentId of componentOrder) {
    const componentConfig = config.components[componentId];

    // Skip if explicitly disabled
    if (componentConfig === false) {
      continue;
    }

    // Render component
    // If componentConfig is undefined, treat as true (use defaults)
    const rendered = renderComponent(
      componentId,
      data,
      componentConfig === true || componentConfig === undefined ? {} : componentConfig,
      config
    );

    // Skip null results (missing data)
    if (rendered !== null) {
      renderedComponents.push(rendered);
    }
  }

  // Join components with separator
  const separator = config.display.separator ?? ' | ';
  let statusline = renderedComponents.join(separator);

  // Append error indicator if present
  if (errorState) {
    // Check if this is a transition state
    const isTransition =
      errorState === 'switching-provider' ||
      errorState === 'new-credentials' ||
      errorState === 'new-endpoint' ||
      errorState === 'auth-error-waiting';

    // Transition states always replace output
    if (isTransition) {
      statusline = renderError(errorState, 'with-cache', data.provider, undefined, cacheAge);
    } else {
      // Non-transition errors: append if cache, replace if no cache
      const hasCache = renderedComponents.length > 0;
      const errorMode = hasCache ? 'with-cache' : 'without-cache';
      const errorIndicator = renderError(
        errorState,
        errorMode,
        data.provider,
        undefined,
        cacheAge
      );

      if (hasCache) {
        // With cache: append with space
        statusline = `${statusline} ${errorIndicator}`;
      } else {
        // Without cache: error message replaces output
        statusline = errorIndicator;
      }
    }
  }

  // Apply truncation
  const termWidth = getTerminalWidth();
  const maxWidth = computeMaxWidth(termWidth, config.display.maxWidth ?? 80);
  statusline = ansiAwareTruncate(statusline, maxWidth);

  return statusline;
}

/**
 * Determine component render order from config
 *
 * - Components explicitly listed in config.components are rendered in that order
 * - Components omitted from config are appended in default order
 * - Components set to false are excluded
 *
 * @param config - Full configuration
 * @returns Ordered array of component IDs to render
 */
function getComponentOrder(config: Config): ComponentId[] {
  const explicitOrder: ComponentId[] = [];
  const explicitSet = new Set<ComponentId>();

  // Collect explicitly listed components (in order)
  for (const key of Object.keys(config.components)) {
    if (isComponentId(key)) {
      explicitOrder.push(key);
      explicitSet.add(key);
    }
  }

  // Append default components not explicitly listed
  const order: ComponentId[] = [...explicitOrder];
  for (const componentId of DEFAULT_COMPONENT_ORDER) {
    if (!explicitSet.has(componentId)) {
      order.push(componentId);
    }
  }

  return order;
}

/**
 * Type guard: check if string is a valid ComponentId
 */
function isComponentId(key: string): key is ComponentId {
  return DEFAULT_COMPONENT_ORDER.includes(key as ComponentId);
}
