/**
 * Provider Registry
 *
 * Central registry of all provider adapters with unified interface
 */

import type { NormalizedUsage } from '../types/index.js';
import type { CustomProviderConfig } from '../types/index.js';
import { fetchSub2api } from './sub2api.js';
import { fetchClaudeRelayService } from './claude-relay-service.js';
import { fetchCustom } from './custom.js';
import { resolveProvider } from './autodetect.js';

/**
 * Provider adapter interface
 *
 * All adapters must implement this interface
 */
export interface ProviderAdapter {
  /**
   * Fetch and normalize usage data from the provider
   *
   * @param baseUrl - ANTHROPIC_BASE_URL
   * @param token - ANTHROPIC_AUTH_TOKEN
   * @param timeoutMs - Request timeout in milliseconds
   * @returns Normalized usage data
   */
  fetch(baseUrl: string, token: string, timeoutMs: number): Promise<NormalizedUsage>;
}

/**
 * Built-in provider adapters
 */
const BUILT_IN_ADAPTERS: Record<string, ProviderAdapter> = {
  'sub2api': {
    fetch: fetchSub2api,
  },
  'claude-relay-service': {
    fetch: fetchClaudeRelayService,
  },
};

/**
 * Get provider adapter by ID
 *
 * @param providerId - Provider identifier
 * @param customProviders - Custom provider configs
 * @returns Provider adapter or null if not found
 */
export function getProvider(
  providerId: string,
  customProviders: Record<string, CustomProviderConfig> = {}
): ProviderAdapter | null {
  // Check built-in providers first
  if (BUILT_IN_ADAPTERS[providerId]) {
    return BUILT_IN_ADAPTERS[providerId];
  }

  // Check custom providers
  const customConfig = customProviders[providerId];
  if (customConfig) {
    return {
      fetch: (baseUrl: string, token: string, timeoutMs: number) =>
        fetchCustom(baseUrl, token, customConfig, timeoutMs),
    };
  }

  return null;
}

/**
 * Get provider adapter with autodetection
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @param providerOverride - CC_STATUSLINE_PROVIDER env override
 * @param customProviders - Custom provider configs
 * @returns Provider adapter or null if not found
 */
export function getProviderWithAutodetect(
  baseUrl: string,
  providerOverride: string | null,
  customProviders: Record<string, CustomProviderConfig> = {}
): ProviderAdapter | null {
  const providerId = resolveProvider(baseUrl, providerOverride, customProviders);
  return getProvider(providerId, customProviders);
}

// Re-export useful types and functions
export { resolveProvider, invalidateDetectionCache, clearDetectionCache } from './autodetect.js';
export { validateCustomProvider } from './custom.js';
export type { CustomProviderConfig } from '../types/index.js';
