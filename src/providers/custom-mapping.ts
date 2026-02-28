/**
 * Custom Provider Response Mapping (LEGACY - THIN ADAPTER)
 *
 * DEPRECATED: This file is a backward-compatibility adapter that delegates
 * to response-mapping.ts. New code should use response-mapping.ts directly.
 *
 * All helper functions are re-exported from response-mapping.ts.
 * The mapResponseToUsage function converts CustomProviderConfig to EndpointConfig
 * and delegates to the new implementation.
 */

/* eslint-disable @typescript-eslint/no-deprecated */

import type { NormalizedUsage } from '../types/index.js';
import type { CustomProviderConfig } from '../types/index.js';
import type { EndpointConfig } from '../types/endpoint-config.js';
import { mapResponseToUsage as mapEndpointResponse } from './response-mapping.js';

// Re-export all helper functions from response-mapping.ts for test backward compatibility
export {
  resolveJsonPath,
  extractValue,
  extractNumber,
  extractString,
  extractQuotaWindow,
  extractTokenStatsPeriod,
} from './response-mapping.js';

/**
 * Map API response to NormalizedUsage (legacy adapter)
 *
 * Converts CustomProviderConfig to EndpointConfig and delegates to response-mapping.ts.
 *
 * @deprecated Use mapResponseToUsage from response-mapping.ts with EndpointConfig instead
 */
export function mapResponseToUsage(
  responseData: Record<string, unknown>,
  mapping: Record<string, string | undefined>,
  providerConfig: CustomProviderConfig
): NormalizedUsage {
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
  return mapEndpointResponse(responseData, mapping, endpointConfig);
}
