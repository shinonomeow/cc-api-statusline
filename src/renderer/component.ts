/**
 * Per-Component Rendering
 *
 * Renders individual statusline components with configurable layouts,
 * display modes, and per-part coloring.
 */

import type {
  Config,
  ComponentConfig,
  Layout,
  DisplayMode,
  BarSize,
  BarStyle,
  ClockFormat,
  CountdownConfig,
} from '../types/config.js';
import {
  COMPONENT_SHORT_LABELS,
  COMPONENT_FULL_LABELS,
} from '../types/config.js';
import type { NormalizedUsage, QuotaWindow, BalanceInfo } from '../types/normalized-usage.js';
import { renderBar } from './bar.js';
import { renderCountdown } from './countdown.js';
import { ansiColor, resolveColor } from './colors.js';
import { getProgressIcon } from './icons.js';

/**
 * Component ID type
 */
export type ComponentId = 'daily' | 'weekly' | 'monthly' | 'balance' | 'tokens' | 'rateLimit' | 'plan';

/**
 * Render a single component
 *
 * @param componentId - Component identifier
 * @param data - Normalized usage data
 * @param componentConfig - Component-specific configuration
 * @param globalConfig - Full global configuration
 * @returns Rendered component string, or null if data unavailable
 */
export function renderComponent(
  componentId: ComponentId,
  data: NormalizedUsage,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // Get effective configuration (component overrides take precedence)
  const effectiveLayout = componentConfig.layout ?? globalConfig.display.layout;
  const effectiveDisplayMode = componentConfig.displayMode ?? globalConfig.display.displayMode;
  const effectiveBarSize = componentConfig.barSize ?? globalConfig.display.barSize;
  const effectiveBarStyle = componentConfig.barStyle ?? globalConfig.display.barStyle;
  const clockFormat = globalConfig.display.clockFormat;

  // Route to component-specific renderer
  switch (componentId) {
    case 'daily':
      return renderQuotaComponent(
        'daily',
        data.daily,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat
      );
    case 'weekly':
      return renderQuotaComponent(
        'weekly',
        data.weekly,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat
      );
    case 'monthly':
      return renderQuotaComponent(
        'monthly',
        data.monthly,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat
      );
    case 'balance':
      return renderBalanceComponent(
        data.balance,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig
      );
    case 'tokens':
      return renderTokensComponent(
        data.tokenStats,
        effectiveLayout,
        effectiveDisplayMode,
        componentConfig,
        globalConfig
      );
    case 'rateLimit':
      return renderRateLimitComponent(
        data.rateLimit,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig
      );
    case 'plan':
      return renderPlanComponent(data.planName, effectiveLayout, componentConfig, globalConfig);
    default:
      return null;
  }
}

/**
 * Render a quota component (daily/weekly/monthly)
 */
function renderQuotaComponent(
  componentId: 'daily' | 'weekly' | 'monthly',
  quota: QuotaWindow | null,
  layout: Layout,
  displayMode: DisplayMode,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  clockFormat: ClockFormat
): string | null {
  // No quota data → skip component
  if (!quota) return null;

  // Calculate usage percentage
  const usagePercent = calculateUsagePercent(quota.used, quota.limit);

  // Render label
  const label = renderLabel(componentId, layout, componentConfig, globalConfig, displayMode);

  // Resolve colors
  const barColor = resolvePartColor('bar', usagePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', usagePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', usagePercent, componentConfig, globalConfig);
  const countdownColor = resolvePartColor('countdown', usagePercent, componentConfig, globalConfig);

  // Render display mode (bar/percentage/icon-pct)
  const display = renderDisplayMode(
    displayMode,
    usagePercent,
    barSize,
    barStyle,
    barColor,
    null
  );

  // Render value (percentage)
  const value = ansiColor(`${Math.round(usagePercent)}%`, valueColor);

  // Render countdown
  const countdown = renderCountdownSubComponent(
    quota.resetsAt,
    componentConfig.countdown,
    countdownColor,
    clockFormat
  );

  // Assemble component based on layout
  return assembleComponent(layout, label, labelColor, display, value, countdown);
}

/**
 * Render balance component
 */
function renderBalanceComponent(
  balance: BalanceInfo | null,
  layout: Layout,
  displayMode: DisplayMode,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // No balance data → skip component
  if (!balance) return null;

  // Unlimited balance (-1) special handling
  const isUnlimited = balance.remaining === -1;

  // Calculate usage percentage for color resolution
  let usagePercent: number | null = null;
  if (!isUnlimited && balance.initial !== null && balance.initial > 0) {
    usagePercent = ((balance.initial - balance.remaining) / balance.initial) * 100;
  }

  // For unlimited balance, use "low" color theme
  const effectivePercent = isUnlimited ? 0 : usagePercent;

  // Render label
  const label = renderLabel('balance', layout, componentConfig, globalConfig, displayMode);

  // Resolve colors
  const barColor = resolvePartColor('bar', effectivePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', effectivePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', effectivePercent, componentConfig, globalConfig);

  // Render display mode (skip bar for unlimited)
  const display = isUnlimited
    ? ''
    : renderDisplayMode(displayMode, effectivePercent ?? 0, barSize, barStyle, barColor, null);

  // Render value
  const valueText = isUnlimited ? '∞' : `$${balance.remaining.toFixed(2)}`;
  const value = ansiColor(valueText, valueColor);

  // No countdown for balance
  const countdown = '';

  // Assemble component based on layout
  return assembleComponent(layout, label, labelColor, display, value, countdown);
}

/**
 * Render tokens component
 */
function renderTokensComponent(
  tokenStats: NormalizedUsage['tokenStats'],
  layout: Layout,
  displayMode: DisplayMode,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // No token stats → skip component
  if (!tokenStats) return null;

  // Use total stats if available, otherwise today
  const stats = tokenStats.total ?? tokenStats.today;
  if (!stats) return null;

  // Render label
  const label = renderLabel('tokens', layout, componentConfig, globalConfig, displayMode);

  // Fixed color (no dynamic color for tokens)
  const labelColor = resolvePartColor('label', null, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', null, componentConfig, globalConfig);

  // Format token count (use totalTokens or sum input+output)
  const tokenCount = stats.totalTokens ?? stats.inputTokens + stats.outputTokens;
  const valueText = formatLargeNumber(tokenCount);
  const value = ansiColor(valueText, valueColor);

  // No display mode or countdown for tokens
  const display = '';
  const countdown = '';

  // Assemble component
  return assembleComponent(layout, label, labelColor, display, value, countdown);
}

/**
 * Render rate limit component
 */
function renderRateLimitComponent(
  rateLimit: NormalizedUsage['rateLimit'],
  layout: Layout,
  displayMode: DisplayMode,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // No rate limit data → skip component
  if (!rateLimit) return null;

  // Calculate usage percentage (use requests if available)
  let usagePercent: number | null = null;
  if (rateLimit.requestsLimit !== null && rateLimit.requestsLimit > 0) {
    usagePercent = (rateLimit.requestsUsed / rateLimit.requestsLimit) * 100;
  }

  // Render label
  const label = renderLabel('rateLimit', layout, componentConfig, globalConfig, displayMode);

  // Resolve colors
  const barColor = resolvePartColor('bar', usagePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', usagePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', usagePercent, componentConfig, globalConfig);

  // Render display mode
  const display =
    usagePercent !== null
      ? renderDisplayMode(displayMode, usagePercent, barSize, barStyle, barColor, null)
      : '';

  // Render value (requests used / limit)
  const valueText =
    rateLimit.requestsLimit !== null
      ? `${rateLimit.requestsUsed}/${rateLimit.requestsLimit}`
      : `${rateLimit.requestsUsed}`;
  const value = ansiColor(valueText, valueColor);

  // No countdown for rate limit
  const countdown = '';

  // Assemble component
  return assembleComponent(layout, label, labelColor, display, value, countdown);
}

/**
 * Render plan component (label only)
 */
function renderPlanComponent(
  planName: string,
  layout: Layout,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // Plan component hidden in minimal layout
  if (layout === 'minimal') return null;

  // Render label (which includes plan name)
  const labelColor = resolvePartColor('label', null, componentConfig, globalConfig);

  // Plan is label-only, use plan name as value
  const value = ansiColor(planName, labelColor);

  // Custom label handling: if custom label is set, show both
  if (typeof componentConfig.label === 'object' && componentConfig.label.text) {
    const labelText = ansiColor(componentConfig.label.text, labelColor);
    return `${labelText} ${value}`;
  }

  return value;
}

/**
 * Render label for a component based on layout
 */
function renderLabel(
  componentId: ComponentId,
  layout: Layout,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  displayMode?: DisplayMode
): string {
  // Minimal layout → no label
  if (layout === 'minimal') return '';

  // Custom label override
  if (componentConfig.label === false) return '';

  // If displayMode is icon-pct and label.icon is set, use icon
  if (displayMode === 'icon-pct' && typeof componentConfig.label === 'object' && componentConfig.label.icon) {
    return componentConfig.label.icon;
  }

  if (typeof componentConfig.label === 'string') {
    return layout === 'compact' ? componentConfig.label.charAt(0) : componentConfig.label;
  }
  if (typeof componentConfig.label === 'object' && componentConfig.label.text) {
    return layout === 'compact'
      ? componentConfig.label.text.charAt(0)
      : componentConfig.label.text;
  }

  // Default labels
  if (layout === 'compact') {
    return COMPONENT_SHORT_LABELS[componentId] ?? '';
  }
  return COMPONENT_FULL_LABELS[componentId] ?? '';
}

/**
 * Render display mode (bar/percentage/icon-pct)
 */
function renderDisplayMode(
  displayMode: DisplayMode,
  usagePercent: number,
  barSize: BarSize,
  barStyle: BarStyle,
  barColor: string | null,
  emptyColor: string | null
): string {
  switch (displayMode) {
    case 'bar':
      return renderBar(usagePercent, barSize, barStyle, barColor, emptyColor);
    case 'percentage':
      return ''; // Percentage is shown as value, not display
    case 'icon-pct':
      return getProgressIcon(usagePercent);
    default:
      return '';
  }
}

/**
 * Render countdown sub-component
 */
function renderCountdownSubComponent(
  resetsAt: string | null,
  countdownConfig: boolean | CountdownConfig | undefined,
  countdownColor: string | null,
  clockFormat: ClockFormat
): string {
  // Countdown disabled or no config
  if (countdownConfig === false || !resetsAt) return '';

  // Default countdown config
  const config: CountdownConfig =
    typeof countdownConfig === 'object' ? countdownConfig : {};

  const countdown = renderCountdown(resetsAt, config, clockFormat);
  return countdownColor ? ansiColor(countdown, countdownColor) : countdown;
}

/**
 * Assemble component parts based on layout
 */
function assembleComponent(
  layout: Layout,
  label: string,
  labelColor: string | null,
  display: string,
  value: string,
  countdown: string
): string {
  const coloredLabel = label && labelColor ? ansiColor(label, labelColor) : label;

  const parts: string[] = [];

  if (layout === 'minimal') {
    // Minimal: display + value (+ countdown if present)
    if (display) parts.push(display);
    parts.push(value);
    if (countdown) parts.push(countdown);
  } else if (layout === 'percent-first') {
    // Percent-first: label + value + display (+ countdown if present)
    if (coloredLabel) parts.push(coloredLabel);
    parts.push(value);
    if (display) parts.push(display);
    if (countdown) parts.push(countdown);
  } else {
    // Standard/compact: label + display + value (+ countdown if present)
    if (coloredLabel) parts.push(coloredLabel);
    if (display) parts.push(display);
    parts.push(value);
    if (countdown) parts.push(countdown);
  }

  return parts.filter((p) => p).join(' ');
}

/**
 * Calculate usage percentage
 */
function calculateUsagePercent(used: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return (used / limit) * 100;
}

/**
 * Resolve color for a component part
 */
function resolvePartColor(
  part: 'label' | 'bar' | 'value' | 'countdown',
  usagePercent: number | null,
  componentConfig: ComponentConfig,
  globalConfig: Config
): string | null {
  // Check for per-part color override
  if (componentConfig.colors && componentConfig.colors[part]) {
    // Per-part colors support aliases - resolve dynamically
    const partColor = componentConfig.colors[part];
    return resolveColor(partColor ?? null, usagePercent, globalConfig);
  }

  // Fall back to component color (with alias resolution)
  const color = componentConfig.color ?? 'auto';
  return resolveColor(color, usagePercent, globalConfig);
}

/**
 * Format large numbers with K/M/B suffixes
 */
function formatLargeNumber(n: number): string {
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1)}B`;
  } else if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  } else if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toString();
}
