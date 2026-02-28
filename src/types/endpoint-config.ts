/**
 * Endpoint Configuration Schema
 *
 * Defines provider endpoint configurations with auth, detection,
 * and response mapping for external API files.
 */

/**
 * Authentication configuration for endpoint requests
 *
 * Supports three auth types:
 * - bearer-header: Authorization: Bearer <token>
 * - body-key: Token passed in request body
 * - custom-header: Custom header with optional prefix
 */
export interface EndpointAuthConfig {
  type: 'bearer-header' | 'body-key' | 'custom-header';
  header?: string; // Header name for custom-header type
  prefix?: string; // Prefix before token value (e.g., "Bearer ")
  bodyField?: string; // JSON body key for body-key type
}

/**
 * Provider detection configuration
 *
 * Used for auto-detecting provider from baseUrl.
 * Either urlPatterns or healthMatch can trigger detection.
 */
export interface EndpointDetectionConfig {
  urlPatterns?: string[]; // URL substrings to match (e.g., ["/apistats"])
  healthMatch?: Record<string, string>; // Health probe response field matchers ("*" = any value present)
}

/**
 * Complete endpoint configuration
 *
 * Defines all aspects of a provider endpoint:
 * - HTTP request details (path, method, auth)
 * - Response field mapping (JSONPath)
 * - Auto-detection rules
 * - Default values for missing fields
 */
export interface EndpointConfig {
  provider: string; // Unique provider ID
  displayName?: string; // Human-readable name (defaults to provider)

  endpoint: {
    path: string; // API path appended to base URL
    method: 'GET' | 'POST'; // HTTP method
    contentType?: string; // Request Content-Type (default: application/json)
  };

  auth: EndpointAuthConfig; // Authentication configuration
  defaults?: Record<string, unknown>; // Default values for missing response fields
  detection?: EndpointDetectionConfig; // Auto-detection rules
  requestBody?: Record<string, unknown> | null; // JSON body template for POST requests

  responseMapping: Record<string, string | undefined>; // REQUIRED: JSONPath field mappings

  spoofClaudeCodeUA?: boolean | string; // User-Agent spoofing (false/undefined = none, true = auto-detect, "string" = exact UA)
}

/**
 * Registry of endpoint configurations
 *
 * Maps provider ID to its endpoint configuration.
 * Loaded from api-config/*.json files.
 */
export type EndpointConfigRegistry = Record<string, EndpointConfig>;
