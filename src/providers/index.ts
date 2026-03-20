/**
 * Provider Registry
 *
 * Central registry of all provider adapters with unified interface
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import type { EndpointConfigRegistry } from '../types/endpoint-config.js';
import { fetchSub2api } from './sub2api.js';
import { fetchClaudeRelayService } from './claude-relay-service.js';
import { fetchCrsAdmin } from './crs-admin.js';
import { fetchEndpoint } from './endpoint-fetch.js';

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
  'crs-admin': {
    fetch: fetchCrsAdmin,
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

// Re-export useful types and functions
export { resolveProvider, invalidateDetectionCache, clearDetectionCache } from './autodetect.js';
export { validateEndpointConfigSemantics } from './endpoint-fetch.js';
export { extractOrigin, probeHealth } from './health-probe.js';
export type { EndpointConfig, EndpointConfigRegistry } from '../types/endpoint-config.js';
