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

interface EffectiveDisplayOptions {
    layout: Layout;
    displayMode: DisplayMode;
    progressStyle: ProgressStyle;
    barSize: BarSize;
    barStyle: BarStyle;
    clockFormat: ClockFormat;
}

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
    const options: EffectiveDisplayOptions = {
        layout: componentConfig.layout ?? globalConfig.display.layout,
        displayMode: resolveEffectiveDisplayMode(
            componentConfig.displayMode ?? globalConfig.display.displayMode,
            renderContext
        ),
        progressStyle: resolveEffectiveProgressStyle(
            componentConfig.progressStyle ?? globalConfig.display.progressStyle,
            renderContext
        ),
        barSize: componentConfig.barSize ?? globalConfig.display.barSize,
        barStyle: componentConfig.barStyle ?? globalConfig.display.barStyle,
        clockFormat: globalConfig.display.clockFormat,
    };

    // Route to component-specific renderer
    switch (componentId) {
        case 'daily':
        case 'weekly':
        case 'monthly':
            return renderQuotaComponent(
                componentId,
                data[componentId],
                options,
                componentConfig,
                globalConfig,
                renderContext
            );
        case 'balance':
            return renderBalanceComponent(
                data.balance,
                options,
                componentConfig,
                globalConfig,
                renderContext
            );
        case 'tokens':
            return renderTokensComponent(
                data.tokenStats,
                options,
                componentConfig,
                globalConfig,
                renderContext
            );
        case 'rateLimit':
            return renderRateLimitComponent(
                data.rateLimit,
                options,
                componentConfig,
                globalConfig,
                renderContext
            );
        case 'plan':
            return renderPlanComponent(data.planName, options, componentConfig, globalConfig, renderContext);
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
    options: EffectiveDisplayOptions,
    componentConfig: ComponentConfig,
    globalConfig: Config,
    renderContext?: RenderContext
): string | null {
    const { layout, displayMode, progressStyle, barSize, barStyle, clockFormat } = options;

    // No quota data → skip component
    if (!quota) return null;

    // Calculate usage percentage
    const usagePercent = calculateUsagePercent(quota.used, quota.limit);

    // Render label (with optional qualifier from QuotaWindow)
    const label = renderLabel(componentId, displayMode, componentConfig, quota.qualifier);

    const showPercentage = componentConfig.percentage !== false;

    // Resolve colors
    const barColor = resolvePartColor('bar', usagePercent, componentConfig, globalConfig);
    const valueColor = showPercentage ? resolvePartColor('value', usagePercent, componentConfig, globalConfig) : null;
    const labelColor = resolvePartColor('label', usagePercent, componentConfig, globalConfig);
    const countdownColor = resolvePartColor('countdown', usagePercent, componentConfig, globalConfig);

    // Render progress indicator (bar/icon/hidden)
    const progress = renderProgress(progressStyle, usagePercent, barSize, barStyle, barColor, null, renderContext);

    // Render value (percentage)
    const percentText = usagePercent > 0 && usagePercent < 10
        ? `${(Math.round(usagePercent * 10) / 10).toFixed(1)}%`
        : `${Math.round(usagePercent)}%`;
    const value = showPercentage
        ? ansiColor(percentText, valueColor, renderContext)
        : '';

    // Render secondary display: threshold-based countdown for daily/weekly, original logic for others
    const COUNTDOWN_THRESHOLDS: Partial<Record<'daily' | 'weekly' | 'monthly', number>> = {
        daily: 80,
        weekly: 90,
    };
    const threshold = COUNTDOWN_THRESHOLDS[componentId];

    let countdown = '';
    if (threshold !== undefined) {
        // daily/weekly: only show countdown when above threshold
        if (usagePercent >= threshold && quota.resetsAt !== null) {
            const config: CountdownConfig =
                typeof componentConfig.countdown === 'object' ? componentConfig.countdown : {};
            const raw = renderCountdown(quota.resetsAt, config, clockFormat);
            countdown = countdownColor ? ansiColor(raw, countdownColor, renderContext) : raw;
        }
    } else {
        // monthly and others: keep original logic
        countdown = renderSecondaryDisplay(
            quota.resetsAt,
            quota,
            componentConfig.countdown,
            countdownColor,
            clockFormat,
            renderContext
        );
    }

    // Assemble component based on layout
    return assembleComponent(layout, label, labelColor, progress, value, countdown, renderContext);
}

/**
 * Render balance component
 */
function renderBalanceComponent(
    balance: BalanceInfo | null,
    options: EffectiveDisplayOptions,
    componentConfig: ComponentConfig,
    globalConfig: Config,
    renderContext?: RenderContext
): string | null {
    const { layout, displayMode, progressStyle, barSize, barStyle, clockFormat } = options;
    void clockFormat;

    // No balance data → skip component
    if (!balance) return null;

    // Unlimited balance (-1) special handling
    const isUnlimited = balance.remaining === -1;

    // Calculate usage percentage for color resolution
    let usagePercent: number | null = null;
    if (!isUnlimited && balance.initial !== null && balance.initial > 0) {
        usagePercent = calculateUsagePercent(balance.initial - balance.remaining, balance.initial);
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
        : renderProgress(progressStyle, effectivePercent ?? 0, barSize, barStyle, barColor, null, renderContext);

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
    options: EffectiveDisplayOptions,
    componentConfig: ComponentConfig,
    globalConfig: Config,
    renderContext?: RenderContext
): string | null {
    const { layout, displayMode, progressStyle, barSize, barStyle, clockFormat } = options;
    void progressStyle;
    void barSize;
    void barStyle;
    void clockFormat;

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
    options: EffectiveDisplayOptions,
    componentConfig: ComponentConfig,
    globalConfig: Config,
    renderContext?: RenderContext
): string | null {
    const { layout, displayMode, progressStyle, barSize, barStyle, clockFormat } = options;
    void clockFormat;

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
            ? renderProgress(progressStyle, usagePercent, barSize, barStyle, barColor, null, renderContext)
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
    options: EffectiveDisplayOptions,
    componentConfig: ComponentConfig,
    globalConfig: Config,
    renderContext?: RenderContext
): string | null {
    const { layout, displayMode, progressStyle, barSize, barStyle, clockFormat } = options;
    void layout;
    void progressStyle;
    void barSize;
    void barStyle;
    void clockFormat;

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
    emptyColor: string | null,
    renderContext?: RenderContext
): string {
    switch (progressStyle) {
        case 'bar':
            return renderBar(usagePercent, barSize, barStyle, barColor, emptyColor);
        case 'icon': {
            const icon = getProgressIcon(usagePercent, true);
            return ansiColor(icon, barColor, renderContext);
        }
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
 * Render secondary display (cost-first priority)
 * Priority chain:
 * 1. If countdownConfig is false → return ''
 * 2. Cost display ($used/$limit) - if limit is meaningful (> 0)
 * 3. Countdown - if resetsAt is available and no cost data
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
    // Secondary display disabled
    if (countdownConfig === false) return '';

    // Default countdown config
    const config: CountdownConfig =
        typeof countdownConfig === 'object' ? countdownConfig : {};

    const divider = config.divider ?? ' · ';
    const prefix = config.prefix ?? '';

    // Priority 1: Cost display (if limit is meaningful)
    if (quota.limit !== null && quota.limit > 0) {
        const costDisplay = formatCurrencyQuota(quota.used, quota.limit);
        const display = `${prefix}${divider}${costDisplay}`;
        return countdownColor ? ansiColor(display, countdownColor, renderContext) : display;
    }

    // Priority 2: Countdown (only if no meaningful cost data)
    if (resetsAt !== null) {
        const countdown = renderCountdown(resetsAt, config, clockFormat);
        return countdownColor ? ansiColor(countdown, countdownColor, renderContext) : countdown;
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
        // Percent-first: label + value + progress
        if (coloredLabel) parts.push(coloredLabel);
        if (value) parts.push(value);
        if (progress) parts.push(progress);
    } else {
        // Standard: label + progress + value
        if (coloredLabel) parts.push(coloredLabel);
        if (progress) parts.push(progress);
        if (value) parts.push(value);
    }

    // Countdown is always last — append directly to avoid an extra join-space before the divider
    if (countdown && parts.length > 0) {
        const idx = parts.length - 1;
        parts[idx] = (parts[idx] ?? '') + countdown;
    } else if (countdown) {
        parts.push(countdown);
    }

    return parts.join(' ');
}

/**
 * Calculate usage percentage
 */
function calculateUsagePercent(used: number, limit: number | null): number {
    // Unlimited quota
    if (limit === null) return 0;

    // Exhausted quota (no allowance) - show as 100% used
    // NOTE: With createQuotaWindow filtering, limit=0 should not reach here,
    // but handle defensively
    if (limit === 0) return 100;

    // Normal case: calculate percentage
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
