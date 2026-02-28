/**
 * Provider Registry
 *
 * Central registry of all provider adapters with unified interface
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import type { EndpointConfigRegistry } from '../types/endpoint-config.js';
import { fetchSub2api } from './sub2api.js';
import { fetchClaudeRelayService } from './claude-relay-service.js';
import { fetchEndpoint } from './endpoint-fetch.js';
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
   * @param config - Application configuration
   * @param timeoutMs - Request timeout in milliseconds
   * @returns Normalized usage data
   */
  fetch(baseUrl: string, token: string, config: Config, timeoutMs: number): Promise<NormalizedUsage>;
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
 * @param endpointConfigs - Endpoint config registry
 * @returns Provider adapter or null if not found
 */
export function getProvider(
  providerId: string,
  endpointConfigs: EndpointConfigRegistry = {}
): ProviderAdapter | null {
  // Check built-in providers first (sub2api, CRS have dedicated adapters)
  if (BUILT_IN_ADAPTERS[providerId]) {
    return BUILT_IN_ADAPTERS[providerId];
  }

  // Check endpoint configs (includes both built-in and custom providers)
  const endpointConfig = endpointConfigs[providerId];
  if (endpointConfig) {
    return {
      fetch: (baseUrl: string, token: string, config: Config, timeoutMs: number) =>
        fetchEndpoint(baseUrl, token, config, endpointConfig, timeoutMs),
    };
  }

  return null;
}

/**
 * Get provider adapter with autodetection
 *
 * @param baseUrl - ANTHROPIC_BASE_URL
 * @param providerOverride - CC_STATUSLINE_PROVIDER env override
 * @param endpointConfigs - Endpoint config registry
 * @param probeTimeoutMs - Health probe timeout in milliseconds
 * @returns Provider adapter or null if not found
 */
export async function getProviderWithAutodetect(
  baseUrl: string,
  providerOverride: string | null,
  endpointConfigs: EndpointConfigRegistry = {},
  probeTimeoutMs: number = 1500
): Promise<ProviderAdapter | null> {
  const providerId = await resolveProvider(baseUrl, providerOverride, endpointConfigs, probeTimeoutMs);
  return getProvider(providerId, endpointConfigs);
}

// Re-export useful types and functions
export { resolveProvider, invalidateDetectionCache, clearDetectionCache } from './autodetect.js';
export { validateEndpointConfig } from './endpoint-fetch.js';
export { extractOrigin, probeHealth } from './health-probe.js';
export type { EndpointConfig, EndpointConfigRegistry } from '../types/endpoint-config.js';
