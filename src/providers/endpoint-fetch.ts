/**
 * Universal Endpoint Fetch Adapter
 *
 * Config-driven provider adapter with JSONPath response mapping.
 * Works for ALL providers (built-in and custom) via EndpointConfig.
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import type { EndpointConfig } from '../types/endpoint-config.js';
import { secureFetch } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';
import { DEFAULT_TIMEOUT_BUDGET_MS } from '../core/constants.js';
import { mapResponseToUsage } from './response-mapping.js';

/**
 * Validate endpoint config
 */
export function validateEndpointConfigSemantics(config: EndpointConfig): string | null {
  if (!config.provider) return 'Endpoint config missing required field: provider';
  if (!config.endpoint?.path) return 'Endpoint config missing required field: endpoint.path';
  if (!config.endpoint?.method) return 'Endpoint config missing required field: endpoint.method';
  if (!config.auth) return 'Endpoint config missing required field: auth';
  if (!config.responseMapping) return 'Endpoint config missing required field: responseMapping';

  // Endpoint path must start with /
  if (!config.endpoint.path.startsWith('/')) {
    return 'Endpoint path must start with /';
  }

  // Validate auth config
  if (config.auth.type === 'custom-header' && !config.auth.header) {
    return 'Auth type="custom-header" requires auth.header';
  }
  if (config.auth.type === 'body-key' && !config.auth.bodyField) {
    return 'Auth type="body-key" requires auth.bodyField';
  }

  return null;
}

/**
 * Fetch and normalize endpoint usage data
 *
 * Universal adapter that works for any provider with an EndpointConfig.
 */
export async function fetchEndpoint(
  baseUrl: string,
  token: string,
  appConfig: Config,
  endpointConfig: EndpointConfig,
  timeoutMs: number = DEFAULT_TIMEOUT_BUDGET_MS
): Promise<NormalizedUsage> {
  // Validate config
  const validationError = validateEndpointConfigSemantics(endpointConfig);
  if (validationError) {
    throw new Error(`Invalid endpoint config: ${validationError}`);
  }

  const url = `${baseUrl}${endpointConfig.endpoint.path}`;

  // Build headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (endpointConfig.endpoint.contentType) {
    headers['Content-Type'] = endpointConfig.endpoint.contentType;
  }

  // Add auth header based on type
  if (endpointConfig.auth.type === 'bearer-header') {
    const prefix = endpointConfig.auth.prefix ?? 'Bearer ';
    headers['Authorization'] = `${prefix}${token}`;
  } else if (endpointConfig.auth.type === 'custom-header' && endpointConfig.auth.header) {
    const prefix = endpointConfig.auth.prefix ?? '';
    headers[endpointConfig.auth.header] = `${prefix}${token}`;
  }

  // Build request body
  let body: string | undefined;
  if (endpointConfig.endpoint.method === 'POST') {
    if (endpointConfig.auth.type === 'body-key' && endpointConfig.auth.bodyField) {
      // Merge auth into requestBody
      const bodyObj = { ...(endpointConfig.requestBody ?? {}) };
      bodyObj[endpointConfig.auth.bodyField] = token;
      body = JSON.stringify(bodyObj);
    } else if (endpointConfig.requestBody) {
      body = JSON.stringify(endpointConfig.requestBody);
    }
  }

  // Resolve User-Agent with per-provider override
  const endpointUA = endpointConfig.spoofClaudeCodeUA;
  const globalUA = appConfig.spoofClaudeCodeUA;
  const effectiveUA = endpointUA !== undefined ? endpointUA : globalUA;
  const resolvedUA = resolveUserAgent(effectiveUA);

  if (resolvedUA) {
    logger.debug(`Using User-Agent for ${endpointConfig.provider}: ${resolvedUA}`);
  }

  const responseText = await secureFetch(
    url,
    {
      method: endpointConfig.endpoint.method,
      headers,
      body,
    },
    timeoutMs,
    resolvedUA
  );

  const responseData = JSON.parse(responseText) as Record<string, unknown>;

  // Map response to NormalizedUsage using universal mapping logic
  const result = mapResponseToUsage(
    responseData,
    endpointConfig.responseMapping,
    endpointConfig
  );

  return result;
}
