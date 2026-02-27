/**
 * Per-Component Rendering
 *
 * Renders individual statusline components with configurable layouts,
 * display modes, progress styles, and per-part coloring.
 */

import type {
  Config,
  ComponentConfig,
  Layout,
  DisplayMode,
  ProgressStyle,
  BarSize,
  BarStyle,
  ClockFormat,
  CountdownConfig,
} from '../types/config.js';
import {
  COMPONENT_SHORT_LABELS,
  COMPONENT_FULL_LABELS,
  COMPONENT_EMOJI_LABELS,
  COMPONENT_NERD_LABELS,
} from '../types/config.js';
import type { NormalizedUsage, QuotaWindow, BalanceInfo } from '../types/normalized-usage.js';
import { renderBar } from './bar.js';
import { renderCountdown } from './countdown.js';
import { ansiColor, resolveColor } from './colors.js';
import { getProgressIcon } from './icons.js';
import { formatCompactNumber, formatCurrencyQuota } from './format.js';
import type { RenderContext } from './context.js';

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
 * @param renderContext - Optional render context with resolved capabilities
 * @returns Rendered component string, or null if data unavailable
 */
export function renderComponent(
  componentId: ComponentId,
  data: NormalizedUsage,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  renderContext?: RenderContext
): string | null {
  // Get effective configuration (component overrides take precedence)
  const effectiveLayout = componentConfig.layout ?? globalConfig.display.layout;
  const effectiveDisplayMode = resolveEffectiveDisplayMode(
    componentConfig.displayMode ?? globalConfig.display.displayMode,
    renderContext
  );
  const effectiveProgressStyle = resolveEffectiveProgressStyle(
    componentConfig.progressStyle ?? globalConfig.display.progressStyle,
    renderContext
  );
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
        effectiveProgressStyle,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat,
        renderContext
      );
    case 'weekly':
      return renderQuotaComponent(
        'weekly',
        data.weekly,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveProgressStyle,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat,
        renderContext
      );
    case 'monthly':
      return renderQuotaComponent(
        'monthly',
        data.monthly,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveProgressStyle,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        clockFormat,
        renderContext
      );
    case 'balance':
      return renderBalanceComponent(
        data.balance,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveProgressStyle,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        renderContext
      );
    case 'tokens':
      return renderTokensComponent(
        data.tokenStats,
        effectiveLayout,
        effectiveDisplayMode,
        componentConfig,
        globalConfig,
        renderContext
      );
    case 'rateLimit':
      return renderRateLimitComponent(
        data.rateLimit,
        effectiveLayout,
        effectiveDisplayMode,
        effectiveProgressStyle,
        effectiveBarSize,
        effectiveBarStyle,
        componentConfig,
        globalConfig,
        renderContext
      );
    case 'plan':
      return renderPlanComponent(data.planName, effectiveLayout, effectiveDisplayMode, componentConfig, globalConfig, renderContext);
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
  progressStyle: ProgressStyle,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  clockFormat: ClockFormat,
  renderContext?: RenderContext
): string | null {
  // No quota data → skip component
  if (!quota) return null;

  // Calculate usage percentage
  const usagePercent = calculateUsagePercent(quota.used, quota.limit);

  // Render label (with optional qualifier from QuotaWindow)
  const label = renderLabel(componentId, displayMode, componentConfig, quota.qualifier);

  // Resolve colors
  const barColor = resolvePartColor('bar', usagePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', usagePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', usagePercent, componentConfig, globalConfig);
  const countdownColor = resolvePartColor('countdown', usagePercent, componentConfig, globalConfig);

  // Render progress indicator (bar/icon/hidden)
  const progress = renderProgress(progressStyle, usagePercent, barSize, barStyle, barColor, null);

  // Render value (percentage)
  const value = ansiColor(`${Math.round(usagePercent)}%`, valueColor, renderContext);

  // Render secondary display (countdown or cost fallback)
  const countdown = renderSecondaryDisplay(
    quota.resetsAt,
    quota,
    componentConfig.countdown,
    countdownColor,
    clockFormat,
    renderContext
  );

  // Assemble component based on layout
  return assembleComponent(layout, label, labelColor, progress, value, countdown, renderContext);
}

/**
 * Render balance component
 */
function renderBalanceComponent(
  balance: BalanceInfo | null,
  layout: Layout,
  displayMode: DisplayMode,
  progressStyle: ProgressStyle,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  renderContext?: RenderContext
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
  const label = renderLabel('balance', displayMode, componentConfig);

  // Resolve colors
  const barColor = resolvePartColor('bar', effectivePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', effectivePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', effectivePercent, componentConfig, globalConfig);

  // Render progress (skip for unlimited)
  const progress = isUnlimited
    ? ''
    : renderProgress(progressStyle, effectivePercent ?? 0, barSize, barStyle, barColor, null);

  // Render value
  const valueText = isUnlimited ? '∞' : `$${balance.remaining.toFixed(2)}`;
  const value = ansiColor(valueText, valueColor, renderContext);

  // No countdown for balance
  const countdown = '';

  // Assemble component based on layout
  return assembleComponent(layout, label, labelColor, progress, value, countdown, renderContext);
}

/**
 * Render tokens component
 */
function renderTokensComponent(
  tokenStats: NormalizedUsage['tokenStats'],
  layout: Layout,
  displayMode: DisplayMode,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  renderContext?: RenderContext
): string | null {
  // No token stats → skip component
  if (!tokenStats) return null;

  // Use total stats if available, otherwise today
  const stats = tokenStats.total ?? tokenStats.today;
  if (!stats) return null;

  // Render label
  const label = renderLabel('tokens', displayMode, componentConfig);

  // Fixed color (no dynamic color for tokens)
  const labelColor = resolvePartColor('label', null, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', null, componentConfig, globalConfig);

  // Format token count (use totalTokens or sum input+output)
  const tokenCount = stats.totalTokens ?? stats.inputTokens + stats.outputTokens;
  const valueText = formatCompactNumber(tokenCount);
  const value = ansiColor(valueText, valueColor, renderContext);

  // No progress or countdown for tokens
  const progress = '';
  const countdown = '';

  // Assemble component
  return assembleComponent(layout, label, labelColor, progress, value, countdown, renderContext);
}

/**
 * Render rate limit component
 */
function renderRateLimitComponent(
  rateLimit: NormalizedUsage['rateLimit'],
  layout: Layout,
  displayMode: DisplayMode,
  progressStyle: ProgressStyle,
  barSize: BarSize,
  barStyle: BarStyle,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  renderContext?: RenderContext
): string | null {
  // No rate limit data → skip component
  if (!rateLimit) return null;

  // Calculate usage percentage (use requests if available)
  let usagePercent: number | null = null;
  if (rateLimit.requestsLimit !== null && rateLimit.requestsLimit > 0) {
    usagePercent = (rateLimit.requestsUsed / rateLimit.requestsLimit) * 100;
  }

  // Render label
  const label = renderLabel('rateLimit', displayMode, componentConfig);

  // Resolve colors
  const barColor = resolvePartColor('bar', usagePercent, componentConfig, globalConfig);
  const valueColor = resolvePartColor('value', usagePercent, componentConfig, globalConfig);
  const labelColor = resolvePartColor('label', usagePercent, componentConfig, globalConfig);

  // Render progress
  const progress =
    usagePercent !== null
      ? renderProgress(progressStyle, usagePercent, barSize, barStyle, barColor, null)
      : '';

  // Render value (requests used / limit)
  const valueText =
    rateLimit.requestsLimit !== null
      ? `${rateLimit.requestsUsed}/${rateLimit.requestsLimit}`
      : `${rateLimit.requestsUsed}`;
  const value = ansiColor(valueText, valueColor, renderContext);

  // No countdown for rate limit
  const countdown = '';

  // Assemble component
  return assembleComponent(layout, label, labelColor, progress, value, countdown, renderContext);
}

/**
 * Render plan component (label only)
 */
function renderPlanComponent(
  planName: string,
  layout: Layout,
  displayMode: DisplayMode,
  componentConfig: ComponentConfig,
  globalConfig: Config,
  renderContext?: RenderContext
): string | null {
  // Plan component hidden when displayMode is 'hidden'
  if (displayMode === 'hidden') return null;

  // Render label (which includes plan name)
  const labelColor = resolvePartColor('label', null, componentConfig, globalConfig);

  // Plan is label-only, use plan name as value
  const value = ansiColor(planName, labelColor, renderContext);

  // Custom label handling: if custom label is set, show both
  if (typeof componentConfig.label === 'object' && componentConfig.label.text) {
    const labelText = ansiColor(componentConfig.label.text, labelColor, renderContext);
    return `${labelText} ${value}`;
  }

  return value;
}

/**
 * Render label for a component based on displayMode
 *
 * displayMode controls label style:
 * - 'text'    → full text label ("Daily")
 * - 'compact' → single-char label ("D")
 * - 'emoji'   → emoji label ("📅")
 * - 'nerd'    → nerd font icon label (falls back to text if unavailable)
 * - 'hidden'  → no label
 *
 * Custom label overrides (priority order):
 * 1. label: false → always hidden
 * 2. label: 'string' → used as text in text/compact mode
 * 3. label: { text?, emoji?, nerd? } → per-mode overrides; unset modes fall back to defaults
 *
 * @param qualifier - Optional qualifier string (e.g. 'Opus') appended as "(Opus)"
 */
function renderLabel(
  componentId: ComponentId,
  displayMode: DisplayMode,
  componentConfig: ComponentConfig,
  qualifier?: string
): string {
  // Hidden mode → no label
  if (displayMode === 'hidden') return '';

  // Custom label: false → always hidden
  if (componentConfig.label === false) return '';

  const label = componentConfig.label;

  let baseLabel: string;

  switch (displayMode) {
    case 'emoji': {
      // Custom emoji from label object
      if (typeof label === 'object' && label.emoji) {
        baseLabel = label.emoji;
      } else {
        baseLabel = COMPONENT_EMOJI_LABELS[componentId] ?? COMPONENT_FULL_LABELS[componentId] ?? '';
      }
      break;
    }
    case 'nerd': {
      // Custom nerd icon from label object
      if (typeof label === 'object' && label.nerd) {
        baseLabel = label.nerd;
      } else {
        baseLabel = COMPONENT_NERD_LABELS[componentId] ?? COMPONENT_FULL_LABELS[componentId] ?? '';
      }
      break;
    }
    case 'compact': {
      // Custom text (first char) or default short label
      if (typeof label === 'string') {
        baseLabel = label.charAt(0);
      } else if (typeof label === 'object' && label.text) {
        baseLabel = label.text.charAt(0);
      } else {
        baseLabel = COMPONENT_SHORT_LABELS[componentId] ?? '';
      }
      break;
    }
    case 'text':
    default: {
      // Custom text or default full label
      if (typeof label === 'string') {
        baseLabel = label;
      } else if (typeof label === 'object' && label.text) {
        baseLabel = label.text;
      } else {
        baseLabel = COMPONENT_FULL_LABELS[componentId] ?? '';
      }
      break;
    }
  }

  // Append qualifier if present — no space: "Weekly(Opus)", "W(O)"
  if (qualifier) {
    if (displayMode === 'compact') {
      return `${baseLabel}(${qualifier.charAt(0)})`;
    }
    return `${baseLabel}(${qualifier})`;
  }

  return baseLabel;
}

/**
 * Render progress indicator based on progressStyle
 *
 * - 'bar'    → progress bar characters
 * - 'icon'   → nerd font progress circle
 * - 'hidden' → empty string
 */
function renderProgress(
  progressStyle: ProgressStyle,
  usagePercent: number,
  barSize: BarSize,
  barStyle: BarStyle,
  barColor: string | null,
  emptyColor: string | null
): string {
  switch (progressStyle) {
    case 'bar':
      return renderBar(usagePercent, barSize, barStyle, barColor, emptyColor);
    case 'icon':
      return getProgressIcon(usagePercent, true);
    case 'hidden':
      return '';
    default:
      return '';
  }
}

/**
 * Resolve effective progress style, falling back from icon when nerd fonts unavailable
 */
function resolveEffectiveProgressStyle(
  requested: ProgressStyle,
  renderContext?: RenderContext
): ProgressStyle {
  if (requested === 'icon' && renderContext && !renderContext.nerdFontAvailable) {
    return 'bar';
  }
  return requested;
}

/**
 * Resolve effective display mode, falling back from nerd when nerd fonts unavailable
 */
function resolveEffectiveDisplayMode(
  requested: DisplayMode,
  renderContext?: RenderContext
): DisplayMode {
  if (requested === 'nerd' && renderContext && !renderContext.nerdFontAvailable) {
    return 'text';
  }
  return requested;
}

/**
 * Render secondary display (countdown or cost fallback)
 * Fallback chain:
 * 1. If countdownConfig is false → return ''
 * 2. If resetsAt is non-null → show time countdown
 * 3. If quota has limit → show cost fallback ($used/$limit)
 * 4. Otherwise → return ''
 */
function renderSecondaryDisplay(
  resetsAt: string | null,
  quota: QuotaWindow,
  countdownConfig: boolean | CountdownConfig | undefined,
  countdownColor: string | null,
  clockFormat: ClockFormat,
  renderContext?: RenderContext
): string {
  // Countdown/secondary display disabled
  if (countdownConfig === false) return '';

  // Default countdown config
  const config: CountdownConfig =
    typeof countdownConfig === 'object' ? countdownConfig : {};

  // Priority 1: Real reset time available → show time countdown
  if (resetsAt !== null) {
    const countdown = renderCountdown(resetsAt, config, clockFormat);
    return countdownColor ? ansiColor(countdown, countdownColor, renderContext) : countdown;
  }

  // Priority 2: No reset time, but cost quota available → show cost
  if (quota.limit !== null) {
    const divider = config.divider ?? ' · ';
    const prefix = config.prefix ?? '';
    const costDisplay = formatCurrencyQuota(quota.used, quota.limit);
    const display = `${prefix}${divider}${costDisplay}`;
    return countdownColor ? ansiColor(display, countdownColor, renderContext) : display;
  }

  // Priority 3: Nothing available → hide
  return '';
}

/**
 * Assemble component parts based on layout
 *
 * layout controls assembly order only:
 * - 'standard':      label + progress + value + countdown
 * - 'percent-first': label + value + progress + countdown
 */
function assembleComponent(
  layout: Layout,
  label: string,
  labelColor: string | null,
  progress: string,
  value: string,
  countdown: string,
  renderContext?: RenderContext
): string {
  const coloredLabel = label && labelColor ? ansiColor(label, labelColor, renderContext) : label;

  const parts: string[] = [];

  if (layout === 'percent-first') {
    // Percent-first: label + value + progress + countdown
    if (coloredLabel) parts.push(coloredLabel);
    parts.push(value);
    if (progress) parts.push(progress);
    if (countdown) parts.push(countdown);
  } else {
    // Standard: label + progress + value + countdown
    if (coloredLabel) parts.push(coloredLabel);
    if (progress) parts.push(progress);
    parts.push(value);
    if (countdown) parts.push(countdown);
  }

  // Join parts with space, then handle countdown dividers
  // If countdown starts with space (e.g., " · "), we get double space: "28% " + " · 2h54m"
  // Remove one space to avoid "28%  · 2h54m" becoming "28% · 2h54m"
  // The regex accounts for ANSI escape sequences that may appear between spaces
  // eslint-disable-next-line no-control-regex
  return parts.filter((p) => p).join(' ').replace(/ (\x1b\[[0-9;]*m)? ([·•])/g, '$1 $2');
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

