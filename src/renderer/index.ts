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
import { renderDivider } from './divider.js';
import { createRenderContext } from './context.js';

/**
 * Render full statusline
 *
 * @param data - Normalized usage data
 * @param config - Full configuration
 * @param errorState - Optional error state to display
 * @param cacheAge - Age of cached data in minutes (for staleness indicator)
 * @param isPiped - Whether running in piped mode (affects capability resolution)
 * @returns Rendered statusline string
 */
export function renderStatusline(
  data: NormalizedUsage,
  config: Config,
  errorState?: ErrorState,
  cacheAge?: number,
  isPiped = false
): string {
  // Create render context (resolved terminal capabilities for this render pass)
  const renderContext = createRenderContext(config, isPiped);

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

    // Render component (if componentConfig is undefined, treat as true → use defaults)
    const rendered = renderComponent(
      componentId,
      data,
      componentConfig === true || componentConfig === undefined ? {} : componentConfig,
      config,
      renderContext
    );

    // Store non-null results in map
    if (rendered !== null) {
      componentMap.set(componentId, rendered);
    }
  }

  // Compute separator string from components.divider config
  const separator = computeSeparator(config);

  // Intelligent component dropping — drop lowest-priority components until we fit
  const activeComponents = new Set(componentMap.keys());
  let currentWidth = calculateStatuslineWidth(componentMap, activeComponents, componentOrder, separator, errorState, data, cacheAge);

  // Keep dropping until we fit or only one component remains
  for (const dropCandidate of COMPONENT_DROP_PRIORITY) {
    // 'countdown' is a sub-component, not top-level
    if (dropCandidate === 'countdown') continue;
    if (currentWidth <= maxWidth(config)) break;
    if (activeComponents.size <= 1) break;

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
      if (rendered) renderedComponents.push(rendered);
    }
  }

  // Join components with separator
  let statusline = renderedComponents.join(separator);

  // Append error indicator if present
  if (errorState) {
    if (isTransitionState(errorState)) {
      statusline = renderError(errorState, 'with-cache', data.provider, undefined, cacheAge);
    } else {
      const hasCache = renderedComponents.length > 0;
      const errorMode = hasCache ? 'with-cache' : 'without-cache';
      const errorIndicator = renderError(errorState, errorMode, data.provider, undefined, cacheAge);
      statusline = hasCache ? `${statusline} ${errorIndicator}` : errorIndicator;
    }
  }

  // Apply hard truncation as safety net
  const termWidth = getTerminalWidth();
  const maxW = computeMaxWidth(termWidth, config.display.maxWidth ?? 100);
  statusline = ansiAwareTruncate(statusline, maxW);

  return statusline;
}

/**
 * Compute the separator string used between rendered components.
 *
 * Priority:
 * 1. components.divider is a DividerConfig object → use renderDivider()
 * 2. components.divider is false → no separator
 * 3. components.divider is true or unset → use display.separator (default: ' | ')
 */
function computeSeparator(config: Config): string {
  const dividerConfig = config.components.divider;
  if (dividerConfig === false) return '';
  if (typeof dividerConfig === 'object') return renderDivider(dividerConfig);
  // true or undefined → fall back to display.separator
  return config.display.separator ?? ' | ';
}

/**
 * Get the maximum width for this render pass
 */
function maxWidth(config: Config): number {
  const termWidth = getTerminalWidth();
  return computeMaxWidth(termWidth, config.display.maxWidth ?? 100);
}

/**
 * Calculate total visible width of statusline with given active components
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
  const components: string[] = [];
  for (const id of componentOrder) {
    if (activeComponents.has(id)) {
      const rendered = componentMap.get(id);
      if (rendered) components.push(rendered);
    }
  }

  let statusline = components.join(separator);

  if (errorState) {
    if (isTransitionState(errorState)) {
      statusline = renderError(errorState, 'with-cache', data.provider, undefined, cacheAge);
    } else {
      const hasCache = components.length > 0;
      const errorMode = hasCache ? 'with-cache' : 'without-cache';
      const errorIndicator = renderError(errorState, errorMode, data.provider, undefined, cacheAge);
      statusline = hasCache ? `${statusline} ${errorIndicator}` : errorIndicator;
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
 * - 'divider' is a config-only key, not rendered as a component
 */
function getComponentOrder(config: Config): ComponentId[] {
  const explicitOrder: ComponentId[] = [];
  const explicitSet = new Set<ComponentId>();

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
 * Type guard: check if string is a renderable ComponentId
 * 'divider' is excluded — it's config-only, not rendered directly
 */
function isComponentId(key: string): key is ComponentId {
  return DEFAULT_COMPONENT_ORDER.includes(key as ComponentId);
}
