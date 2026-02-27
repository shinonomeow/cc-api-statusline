/**
 * Custom Provider Support
 *
 * Config-driven provider adapter with JSONPath response mapping
 */

import type { NormalizedUsage, Config } from '../types/index.js';
import type { CustomProviderConfig } from '../types/index.js';
import { secureFetch } from './http.js';
import { resolveUserAgent } from '../services/user-agent.js';
import { logger } from '../services/logger.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../core/constants.js';
import { mapResponseToUsage } from './custom-mapping.js';

/**
 * Validate custom provider providerConfig per spec-custom-providers.md
 */
export function validateCustomProvider(providerConfig: CustomProviderConfig): string | null {
  if (!providerConfig.id) return 'Custom provider missing required field: id';
  if (!providerConfig.endpoint) return 'Custom provider missing required field: endpoint';
  if (!providerConfig.method) return 'Custom provider missing required field: method';
  if (!providerConfig.auth) return 'Custom provider missing required field: auth';
  if (!providerConfig.responseMapping) return 'Custom provider missing required field: responseMapping';

  // Endpoint must start with /
  if (!providerConfig.endpoint.startsWith('/')) {
    return 'Custom provider endpoint must start with /';
  }

  // billingMode is required in responseMapping
  if (!providerConfig.responseMapping.billingMode) {
    return 'Custom provider responseMapping must include billingMode';
  }

  // Validate auth providerConfig
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
 * Fetch and normalize custom provider usage data
 */
export async function fetchCustom(
  baseUrl: string,
  token: string,
  appConfig: Config,
  providerConfig: CustomProviderConfig,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<NormalizedUsage> {
  // Validate providerConfig
  const validationError = validateCustomProvider(providerConfig);
  if (validationError) {
    throw new Error(`Invalid custom provider providerConfig: ${validationError}`);
  }

  const url = `${baseUrl}${providerConfig.endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (providerConfig.contentType) {
    headers['Content-Type'] = providerConfig.contentType;
  }

  // Add auth header if type is header
  if (providerConfig.auth.type === 'header' && providerConfig.auth.header) {
    const prefix = providerConfig.auth.prefix ?? '';
    headers[providerConfig.auth.header] = `${prefix}${token}`;
  }

  // Build request body
  let body: string | undefined;
  if (providerConfig.method === 'POST') {
    if (providerConfig.auth.type === 'body' && providerConfig.auth.bodyField) {
      // Merge auth into requestBody
      const bodyObj = { ...providerConfig.requestBody };
      bodyObj[providerConfig.auth.bodyField] = token;
      body = JSON.stringify(bodyObj);
    } else if (providerConfig.requestBody) {
      body = JSON.stringify(providerConfig.requestBody);
    }
  }

  // Resolve User-Agent with per-provider override
  const providerUA = providerConfig.spoofClaudeCodeUA;
  const globalUA = appConfig.spoofClaudeCodeUA;
  const effectiveUA = providerUA !== undefined ? providerUA : globalUA;
  const resolvedUA = resolveUserAgent(effectiveUA);

  if (resolvedUA) {
    logger.debug(`Using User-Agent for ${providerConfig.id}: ${resolvedUA}`);
  }

  const responseText = await secureFetch(
    url,
    {
      method: providerConfig.method,
      headers,
      body,
    },
    timeoutMs,
    resolvedUA
  );

  const responseData = JSON.parse(responseText) as Record<string, unknown>;

  // Map response to NormalizedUsage using extracted mapping logic
  const result = mapResponseToUsage(
    responseData,
    providerConfig.responseMapping,
    providerConfig
  );

  return result;
}
