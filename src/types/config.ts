/**
 * Configuration Schema
 *
 * All configuration types and defaults for cc-api-statusline.
 */

/**
 * Layout modes control assembly order of parts
 * standard:      label + progress + value + countdown
 * percent-first: label + value + progress + countdown
 */
export type Layout = 'standard' | 'percent-first';

/**
 * Display modes control label rendering style
 * text    = full text labels ("Daily", "Weekly")
 * compact = single-char labels ("D", "W")
 * emoji   = emoji labels ("📅", "📆")
 * nerd    = nerd font icon labels (falls back to text without nerd fonts)
 * hidden  = no labels
 */
export type DisplayMode = 'text' | 'compact' | 'emoji' | 'nerd' | 'hidden';

/**
 * Progress styles control how the usage fraction is visualized
 * bar    = progress bar characters
 * icon   = nerd font progress circle (falls back to bar without nerd fonts)
 * hidden = no progress indicator
 */
export type ProgressStyle = 'bar' | 'icon' | 'hidden';

/**
 * Bar sizes (width in characters)
 */
export type BarSize = 'small' | 'small-medium' | 'medium' | 'medium-large' | 'large';

/**
 * Bar styles (built-in named styles or custom chars)
 */
export type BarStyle =
  | 'classic'
  | 'block'
  | 'shade'
  | 'pipe'
  | 'dot'
  | 'braille'
  | 'square'
  | 'star'
  | { fill: string; empty: string };

/**
 * Clock formats for countdown display
 */
export type ClockFormat = '12h' | '24h';

/**
 * Color rendering mode for terminal output
 */
export type ColorMode = '16' | '256' | 'truecolor' | 'auto';

/**
 * Divider configuration between components
 */
export interface DividerConfig {
  text?: string;    // Divider text, default '|'
  padding?: number; // Spaces on each side, default 1
  color?: string;   // Optional color name/hex
}

/**
 * Countdown display format
 */
export type CountdownFormat = 'auto' | 'duration' | 'time';

/**
 * Countdown configuration
 */
export interface CountdownConfig {
  enabled?: boolean; // defaults to true if countdown object exists
  format?: CountdownFormat; // auto (switches at 24h), duration (always remaining), time (wall-clock)
  divider?: string; // between value and countdown, e.g. "·"
  prefix?: string; // before countdown text, e.g. "resets "
}

/**
 * Label configuration
 */
export interface LabelConfig {
  text?: string; // Custom text for 'text'/'compact' modes
  emoji?: string; // Custom emoji for 'emoji' mode
  nerd?: string; // Custom nerd icon for 'nerd' mode
}

/**
 * Per-part color configuration
 */
export interface PartColors {
  label?: string; // Color for label text
  bar?: string; // Color for bar fill
  value?: string; // Color for value text
  countdown?: string; // Color for countdown text
}

/**
 * Color tier for tiered color system
 */
export interface ColorTier {
  color: string; // Color name, hex, or theme color
  maxPercent: number; // Max percentage for this tier (exclusive upper bound)
}

/**
 * Tiered color alias entry (5-tier format)
 */
export interface ColorTieredEntry {
  tiers: ColorTier[];
}

/**
 * Legacy color alias entry (3-tier format, backward compatible)
 */
export interface ColorLegacyEntry {
  low: string; // Color when usage < lowThreshold
  medium: string; // Color when usage < highThreshold
  high: string; // Color when usage >= highThreshold
  lowThreshold: number; // Default 50
  highThreshold: number; // Default 80
}

/**
 * Dynamic color alias entry (supports both legacy and tiered formats)
 */
export type ColorAliasEntry = ColorLegacyEntry | ColorTieredEntry;

/**
 * Color configuration
 */
export interface ColorsConfig {
  [aliasName: string]: ColorAliasEntry | string; // Aliases or direct color values
}

/**
 * Component-specific configuration
 */
export interface ComponentConfig {
  layout?: Layout; // Override global layout (assembly order)
  displayMode?: DisplayMode; // Override global displayMode (label style)
  progressStyle?: ProgressStyle; // Override global progressStyle (progress indicator)
  barSize?: BarSize; // Override global barSize
  barStyle?: BarStyle; // Override global barStyle
  color?: string; // Shorthand color for all parts (or alias name)
  colors?: PartColors; // Per-part color overrides
  label?: string | LabelConfig | false; // Custom label or false to hide
  countdown?: boolean | CountdownConfig; // Countdown sub-component (quota components only)
}

/**
 * Components configuration (component ID → bool or config)
 */
export interface ComponentsConfig {
  daily?: boolean | ComponentConfig;
  weekly?: boolean | ComponentConfig;
  monthly?: boolean | ComponentConfig;
  balance?: boolean | ComponentConfig;
  tokens?: boolean | ComponentConfig;
  rateLimit?: boolean | ComponentConfig;
  plan?: boolean | ComponentConfig;
  divider?: boolean | DividerConfig; // Separator between components; true = use display.separator default
}

/**
 * Global display configuration
 */
export interface DisplayConfig {
  layout: Layout; // Assembly order: standard | percent-first
  displayMode: DisplayMode; // Label style: text | compact | emoji | nerd | hidden
  progressStyle: ProgressStyle; // Progress indicator: bar | icon | hidden
  barSize: BarSize; // Default: medium
  barStyle: BarStyle; // Default: block
  separator: string; // Between components, default: " | "
  maxWidth: number; // % of terminal width, 20-100, default: 100
  clockFormat: ClockFormat; // 12h or 24h, default: 24h
  colorMode?: ColorMode; // Color rendering mode, default: 'auto'
  nerdFont?: 'auto' | boolean; // Nerd font availability, default: 'auto'
}

/**
 * Custom provider auth configuration
 */
export interface CustomProviderAuthConfig {
  type: 'header' | 'body';
  header?: string; // Header name when type == "header"
  prefix?: string; // Prefix before token value (e.g. "Bearer ")
  bodyField?: string; // JSON body key when type == "body"
}

/**
 * Custom provider response mapping (JSONPath or literal values)
 */
export interface CustomProviderResponseMapping {
  billingMode?: string; // "subscription" | "balance" or JSONPath
  planName?: string; // Literal or JSONPath
  'balance.remaining'?: string; // JSONPath
  'balance.initial'?: string; // JSONPath
  'balance.unit'?: string; // Literal or JSONPath
  'daily.used'?: string; // JSONPath
  'daily.limit'?: string; // JSONPath
  'daily.resetsAt'?: string; // JSONPath
  'weekly.used'?: string; // JSONPath
  'weekly.limit'?: string; // JSONPath
  'weekly.resetsAt'?: string; // JSONPath
  'monthly.used'?: string; // JSONPath
  'monthly.limit'?: string; // JSONPath
  'monthly.resetsAt'?: string; // JSONPath
  'tokenStats.today.requests'?: string; // JSONPath
  'tokenStats.today.inputTokens'?: string; // JSONPath
  'tokenStats.today.outputTokens'?: string; // JSONPath
  'tokenStats.today.cacheCreationTokens'?: string; // JSONPath
  'tokenStats.today.cacheReadTokens'?: string; // JSONPath
  'tokenStats.today.totalTokens'?: string; // JSONPath
  'tokenStats.today.cost'?: string; // JSONPath
  'tokenStats.total.requests'?: string; // JSONPath
  'tokenStats.total.inputTokens'?: string; // JSONPath
  'tokenStats.total.outputTokens'?: string; // JSONPath
  'tokenStats.total.cacheCreationTokens'?: string; // JSONPath
  'tokenStats.total.cacheReadTokens'?: string; // JSONPath
  'tokenStats.total.totalTokens'?: string; // JSONPath
  'tokenStats.total.cost'?: string; // JSONPath
  'tokenStats.rpm'?: string; // JSONPath
  'tokenStats.tpm'?: string; // JSONPath
  'rateLimit.windowSeconds'?: string; // JSONPath
  'rateLimit.requestsUsed'?: string; // JSONPath
  'rateLimit.requestsLimit'?: string; // JSONPath
  'rateLimit.costUsed'?: string; // JSONPath
  'rateLimit.costLimit'?: string; // JSONPath
  'rateLimit.remainingSeconds'?: string; // JSONPath
  [key: string]: string | undefined; // Allow unknown keys
}

/**
 * Custom provider configuration
 */
export interface CustomProviderConfig {
  id: string; // Unique provider identifier
  displayName?: string; // Human label; defaults to id
  endpoint: string; // Path appended to ANTHROPIC_BASE_URL
  method: 'GET' | 'POST'; // HTTP method
  contentType?: string; // Request content-type; default "application/json"
  auth: CustomProviderAuthConfig;
  requestBody?: Record<string, unknown> | null; // JSON body template
  urlPatterns: string[]; // URL substrings for autodetection
  responseMapping: CustomProviderResponseMapping;
  spoofClaudeCodeUA?: boolean | string; // User-Agent spoofing: false/undefined = none, true = auto-detect, "string" = exact UA
}

/**
 * Main configuration
 */
export interface Config {
  display: DisplayConfig;
  components: ComponentsConfig;
  colors?: ColorsConfig;
  spoofClaudeCodeUA?: boolean | string; // User-Agent spoofing: false/undefined = none, true = auto-detect, "string" = exact UA
  customProviders?: Record<string, CustomProviderConfig>;
  pollIntervalSeconds?: number; // Default: 30, minimum: 5
  pipedRequestTimeoutMs?: number; // Default: 800, for piped mode fetch timeout
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Config = {
  display: {
    layout: 'standard',
    displayMode: 'text',
    progressStyle: 'icon',
    barSize: 'medium',
    barStyle: 'block',
    separator: ' | ',
    maxWidth: 100,
    clockFormat: '24h',
    colorMode: 'auto',
    nerdFont: 'auto',
  },
  components: {
    daily: true,
    weekly: true,
    monthly: true,
    balance: true,
    tokens: false,
    rateLimit: false,
    plan: false,
    divider: true,
  },
  colors: {
    auto: {
      tiers: [
        { color: 'cool', maxPercent: 30 },
        { color: 'comfortable', maxPercent: 65 },
        { color: 'warm', maxPercent: 80 },
        { color: 'hot', maxPercent: 90 },
        { color: 'critical', maxPercent: 100 },
      ],
    },
    chill: {
      low: 'cyan',
      medium: 'blue',
      high: 'magenta',
      lowThreshold: 50,
      highThreshold: 80,
    },
  },
  customProviders: {},
  pollIntervalSeconds: 30,
  pipedRequestTimeoutMs: 800,
};

/**
 * Bar size to character count mapping
 */
export const BAR_SIZE_MAP: Record<BarSize, number> = {
  small: 4,
  'small-medium': 6,
  medium: 8,
  'medium-large': 10,
  large: 12,
};

/**
 * Built-in bar styles
 */
export const BUILT_IN_BAR_STYLES: Record<string, { fill: string; empty: string }> = {
  classic: { fill: '━', empty: '─' },
  block: { fill: '█', empty: '░' },
  shade: { fill: '▓', empty: '░' },
  pipe: { fill: '┃', empty: '┊' },
  dot: { fill: '●', empty: '○' },
  braille: { fill: '⣿', empty: '⣀' },
  square: { fill: '■', empty: '□' },
  star: { fill: '★', empty: '☆' },
};

/**
 * Component short labels for compact layout
 */
export const COMPONENT_SHORT_LABELS: Record<string, string> = {
  daily: 'D',
  weekly: 'W',
  monthly: 'M',
  balance: 'B',
  tokens: 'T',
  rateLimit: 'R',
  plan: 'P',
};

/**
 * Component full labels for standard layout
 */
export const COMPONENT_FULL_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  balance: 'Balance',
  tokens: 'Tokens',
  rateLimit: 'Rate',
  plan: 'Plan',
};

/**
 * Component emoji labels for emoji display mode
 */
export const COMPONENT_EMOJI_LABELS: Record<string, string> = {
  daily: '📅',
  weekly: '📆',
  monthly: '🗓️',
  balance: '💰',
  tokens: '🔢',
  rateLimit: '⚡',
  plan: '📋',
};

/**
 * Component nerd font icon labels for nerd display mode
 * Uses Font Awesome icons available in most nerd font distributions
 */
export const COMPONENT_NERD_LABELS: Record<string, string> = {
  daily: '\u{F073}', // nf-fa-calendar
  weekly: '\u{F274}', // nf-fa-calendar_check_o
  monthly: '\u{F133}', // nf-fa-calendar_o
  balance: '\u{F155}', // nf-fa-dollar
  tokens: '\u{F0B1}', // nf-fa-briefcase
  rateLimit: '\u{F0E7}', // nf-fa-bolt
  plan: '\u{F0AE}', // nf-fa-tasks
};

/**
 * Default render order for components
 */
export const DEFAULT_COMPONENT_ORDER: string[] = [
  'daily',
  'weekly',
  'monthly',
  'balance',
  'tokens',
  'rateLimit',
  'plan',
];
