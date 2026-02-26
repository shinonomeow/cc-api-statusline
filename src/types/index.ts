/**
 * Central type exports
 */

// Normalized usage types
export type {
  NormalizedUsage,
  QuotaWindow,
  BalanceInfo,
  PeriodTokens,
  TokenStats,
  RateLimitWindow,
  ResetSemantics,
  BillingMode,
} from './normalized-usage.js';

export { isQuotaWindow, isBalanceInfo, createEmptyNormalizedUsage, computeSoonestReset } from './normalized-usage.js';

// Config types
export type {
  Config,
  DisplayConfig,
  ComponentConfig,
  ComponentsConfig,
  CountdownConfig,
  LabelConfig,
  PartColors,
  ColorAliasEntry,
  ColorsConfig,
  CustomProviderConfig,
  CustomProviderAuthConfig,
  CustomProviderResponseMapping,
  Layout,
  DisplayMode,
  BarSize,
  BarStyle,
  ClockFormat,
  CountdownFormat,
} from './config.js';

export {
  DEFAULT_CONFIG,
  BAR_SIZE_MAP,
  BUILT_IN_BAR_STYLES,
  COMPONENT_SHORT_LABELS,
  COMPONENT_FULL_LABELS,
  DEFAULT_COMPONENT_ORDER,
} from './config.js';

// Cache types
export type { CacheEntry, ErrorState } from './cache.js';

export { CACHE_VERSION, DEFAULT_CACHE_TTL_SECONDS, isCacheEntry } from './cache.js';

// Env types (from services, but used in types for cache validation)
export type { EnvSnapshot } from '../services/env.js';
