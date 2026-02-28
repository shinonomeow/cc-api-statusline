/**
 * Custom Provider Support (LEGACY - THIN ADAPTER)
 *
 * DEPRECATED: This file is a backward-compatibility adapter that delegates
 * to endpoint-fetch.ts. New code should use endpoint-fetch.ts directly.
 *
 * The validateCustomProvider function is kept for test compatibility.
 * The fetchCustom function converts CustomProviderConfig to EndpointConfig
 * and delegates to the new implementation.
 */

/* eslint-disable @typescript-eslint/no-deprecated */

import type { NormalizedUsage, Config } from '../types/index.js';
import type { CustomProviderConfig } from '../types/index.js';
import type { EndpointConfig } from '../types/endpoint-config.js';
import { fetchEndpoint } from './endpoint-fetch.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../core/constants.js';

/**
 * Validate custom provider config (legacy)
 *
 * Kept for test backward compatibility.
 *
 * @deprecated Use validateEndpointConfig from endpoint-fetch.ts instead
 */
export function validateCustomProvider(providerConfig: CustomProviderConfig): string | null {
  if (!providerConfig.id) return 'Custom provider missing required field: id';
  if (!providerConfig.endpoint) return 'Custom provider missing required field: endpoint';
  if (!providerConfig.method) return 'Custom provider missing required field: method';
  if (!providerConfig.auth) return 'Custom provider missing required field: auth';
  if (!providerConfig.responseMapping) return 'Custom provider responseMapping must include billingMode';

  // Endpoint must start with /
  if (!providerConfig.endpoint.startsWith('/')) {
    return 'Custom provider endpoint must start with /';
  }

  // billingMode is required in responseMapping
  if (!providerConfig.responseMapping.billingMode) {
    return 'Custom provider responseMapping must include billingMode';
  }

  // Validate auth config
  if (providerConfig.auth.type === 'header' && !providerConfig.auth.header) {
    return 'Custom provider auth.type="header" requires auth.header';
  }
  if (providerConfig.auth.type === 'body' && !providerConfig.auth.bodyField) {
    return 'Custom provider auth.type="body" requires auth.bodyField';
  }

  // urlPatterns is optional per spec, but should be array if provided
  if (providerConfig.urlPatterns && !Array.isArray(providerConfig.urlPatterns)) {
    return 'Custom provider urlPatterns must be an array';
  }

  return null;
}

/**
 * Fetch and normalize custom provider usage data (legacy adapter)
 *
 * Converts CustomProviderConfig to EndpointConfig and delegates to endpoint-fetch.ts.
 *
 * @deprecated Use fetchEndpoint from endpoint-fetch.ts with EndpointConfig instead
 */
export async function fetchCustom(
  baseUrl: string,
  token: string,
  appConfig: Config,
  providerConfig: CustomProviderConfig,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<NormalizedUsage> {
  // Validate config
  const validationError = validateCustomProvider(providerConfig);
  if (validationError) {
    throw new Error(`Invalid custom provider config: ${validationError}`);
  }

  // Convert CustomProviderConfig to EndpointConfig
  const endpointConfig: EndpointConfig = {
    provider: providerConfig.id,
    displayName: providerConfig.displayName,
    endpoint: {
      path: providerConfig.endpoint,
      method: providerConfig.method,
      contentType: providerConfig.contentType,
    },
    auth: {
      type: providerConfig.auth.type === 'header' ? 'custom-header' : 'body-key',
      header: providerConfig.auth.header,
      prefix: providerConfig.auth.prefix,
      bodyField: providerConfig.auth.bodyField,
    },
    detection: {
      urlPatterns: providerConfig.urlPatterns,
    },
    requestBody: providerConfig.requestBody,
    responseMapping: providerConfig.responseMapping,
    spoofClaudeCodeUA: providerConfig.spoofClaudeCodeUA,
  };

  // Delegate to the new implementation
  return fetchEndpoint(baseUrl, token, appConfig, endpointConfig, timeoutMs);
}
