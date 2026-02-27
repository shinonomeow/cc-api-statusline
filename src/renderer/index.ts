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
import { isTransitionState } from './transition.js';
import {
  getTerminalWidth,
  computeMaxWidth,
  ansiAwareTruncate,
  visibleLength,
  COMPONENT_DROP_PRIORITY,
} from './truncate.js';
import { DEFAULT_COMPONENT_ORDER } from '../types/config.js';

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

  // Render each enabled component into a map
  const componentMap = new Map<ComponentId, string>();
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

    // Store non-null results in map
    if (rendered !== null) {
      componentMap.set(componentId, rendered);
    }
  }

  // Get target width
  const termWidth = getTerminalWidth();
  const maxWidth = computeMaxWidth(termWidth, config.display.maxWidth ?? 100);
  const separator = config.display.separator ?? ' | ';

  // Intelligent component dropping
  // Start with all components and drop lowest-priority ones until we fit
  const activeComponents = new Set(componentMap.keys());

  // Calculate current width
  let currentWidth = calculateStatuslineWidth(componentMap, activeComponents, componentOrder, separator, errorState, data, cacheAge);

  // Drop components in priority order until we fit (or run out of components to drop)
  // Keep at least one component (don't drop everything)
  for (const dropCandidate of COMPONENT_DROP_PRIORITY) {
    // Skip 'countdown' - it's a sub-component, not a top-level component
    if (dropCandidate === 'countdown') {
      continue;
    }

    // If we fit within maxWidth, stop dropping
    if (currentWidth <= maxWidth) {
      break;
    }

    // Don't drop if it's the last component
    if (activeComponents.size <= 1) {
      break;
    }

    // Drop this component if it exists
    if (activeComponents.has(dropCandidate as ComponentId)) {
      activeComponents.delete(dropCandidate as ComponentId);
      currentWidth = calculateStatuslineWidth(componentMap, activeComponents, componentOrder, separator, errorState, data, cacheAge);
    }
  }

  // Build final component list in original order
  const renderedComponents: string[] = [];
  for (const componentId of componentOrder) {
    if (activeComponents.has(componentId)) {
      const rendered = componentMap.get(componentId);
      if (rendered) {
        renderedComponents.push(rendered);
      }
    }
  }

  // Join components with separator
  let statusline = renderedComponents.join(separator);

  // Append error indicator if present
  if (errorState) {
    // Transition states always replace output
    if (isTransitionState(errorState)) {
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

  // Apply hard truncation as safety net
  statusline = ansiAwareTruncate(statusline, maxWidth);

  return statusline;
}

/**
 * Calculate total visible width of statusline with given components
 */
function calculateStatuslineWidth(
  componentMap: Map<ComponentId, string>,
  activeComponents: Set<ComponentId>,
  componentOrder: ComponentId[],
  separator: string,
  errorState: ErrorState | undefined,
  data: NormalizedUsage,
  cacheAge: number | undefined
): number {
  // Join active components in the correct order
  const components: string[] = [];
  for (const id of componentOrder) {
    if (activeComponents.has(id)) {
      const rendered = componentMap.get(id);
      if (rendered) {
        components.push(rendered);
      }
    }
  }

  let statusline = components.join(separator);

  // Add error indicator length if present
  if (errorState) {
    if (isTransitionState(errorState)) {
      statusline = renderError(errorState, 'with-cache', data.provider, undefined, cacheAge);
    } else {
      const hasCache = components.length > 0;
      const errorMode = hasCache ? 'with-cache' : 'without-cache';
      const errorIndicator = renderError(errorState, errorMode, data.provider, undefined, cacheAge);

      if (hasCache) {
        statusline = `${statusline} ${errorIndicator}`;
      } else {
        statusline = errorIndicator;
      }
    }
  }

  return visibleLength(statusline);
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
