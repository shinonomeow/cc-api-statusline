# API Config Reference

## Overview

The `api-config/` folder contains endpoint configuration files that define how to fetch and parse API usage data from different providers. Each provider has its own JSON file with endpoint details, authentication, and response field mapping.

**Location**: `~/.claude/cc-api-statusline/api-config/`

---

## File Structure

```
~/.claude/cc-api-statusline/
  config.json                      # Style + timing (hot-reloadable)
  .endpoint-config.lock            # Lock file (hash of active configs)
  api-config/
    sub2api.json                   # Built-in sub2api provider
    crs.json                       # Built-in CRS provider
    my-custom-provider.json        # User-added custom providers
```

---

## Endpoint Config Schema

Each `*.json` file in `api-config/` must follow this schema:

```json
{
  "provider": "unique-provider-id",
  "displayName": "Human Readable Name",
  "endpoint": {
    "path": "/api/usage",
    "method": "GET",
    "contentType": "application/json"
  },
  "auth": {
    "type": "bearer-header",
    "header": "Authorization",
    "prefix": "Bearer ",
    "bodyField": "apiKey"
  },
  "defaults": {
    "unit": "USD",
    "planName": "Unknown"
  },
  "detection": {
    "urlPatterns": ["/custom-api"],
    "healthMatch": { "status": "ok" }
  },
  "requestBody": null,
  "responseMapping": {
    "billingMode": "subscription",
    "planName": "$.planName",
    "daily.used": "$.usage.daily",
    "daily.limit": "$.limits.daily"
  },
  "spoofClaudeCodeUA": false
}
```

---

## Field Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string | Unique provider identifier (used internally) |
| `endpoint.path` | string | API endpoint path (appended to `ANTHROPIC_BASE_URL`) |
| `endpoint.method` | `"GET"` \| `"POST"` | HTTP method |
| `auth` | object | Authentication configuration (see below) |
| `responseMapping` | object | JSONPath mappings for response fields (see below) |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `displayName` | string | `provider` value | Human-readable name for display |
| `endpoint.contentType` | string | `"application/json"` | Request Content-Type header |
| `defaults` | object | `{}` | Default values for missing response fields |
| `detection` | object | `null` | Auto-detection rules (URL patterns, health probe) |
| `requestBody` | object \| null | `null` | JSON body template for POST requests |
| `spoofClaudeCodeUA` | boolean \| string | `false` | User-Agent spoofing (see config.json docs) |

---

## Authentication Types

### `bearer-header` (Most Common)

Standard Bearer token in Authorization header:

```json
{
  "auth": {
    "type": "bearer-header",
    "prefix": "Bearer "
  }
}
```

Uses: `Authorization: Bearer <ANTHROPIC_AUTH_TOKEN>`

### `body-key`

Token passed in request body (for POST requests):

```json
{
  "auth": {
    "type": "body-key",
    "bodyField": "apiKey"
  }
}
```

Sends: `{ "apiKey": "<ANTHROPIC_AUTH_TOKEN>", ...requestBody }`

### `custom-header`

Custom header name with optional prefix:

```json
{
  "auth": {
    "type": "custom-header",
    "header": "X-API-Key",
    "prefix": ""
  }
}
```

Uses: `X-API-Key: <ANTHROPIC_AUTH_TOKEN>`

---

## Response Mapping

The `responseMapping` object uses **JSONPath** to extract fields from API responses.

### JSONPath Syntax

- `$.field` - Root-level field
- `$.nested.field` - Nested field
- `$.array[0]` - Array index
- `$.data.items[0].value` - Complex nested path
- Literal values (no `$.` prefix) are used as-is

### Supported Fields

**Billing Mode**:
- `billingMode` - `"subscription"` or `"balance"` (or JSONPath)

**Plan Info**:
- `planName` - Plan/account name (string or JSONPath)

**Balance Mode** (if `billingMode` = `"balance"`):
- `balance.remaining` - Remaining balance (number)
- `balance.initial` - Initial balance (number)
- `balance.unit` - Currency unit (string, default: `"USD"`)

**Subscription Mode** (if `billingMode` = `"subscription"`):
- `daily.used` - Daily usage (number)
- `daily.limit` - Daily limit (number, `0` = unlimited)
- `daily.resetsAt` - Reset time (ISO-8601 string)
- `weekly.used` - Weekly usage
- `weekly.limit` - Weekly limit
- `weekly.resetsAt` - Reset time
- `monthly.used` - Monthly usage
- `monthly.limit` - Monthly limit
- `monthly.resetsAt` - Reset time

**Token Stats**:
- `tokenStats.today.requests` - Today's request count
- `tokenStats.today.inputTokens` - Today's input tokens
- `tokenStats.today.outputTokens` - Today's output tokens
- `tokenStats.today.cacheCreationTokens` - Today's cache creation tokens
- `tokenStats.today.cacheReadTokens` - Today's cache read tokens
- `tokenStats.today.totalTokens` - Today's total tokens
- `tokenStats.today.cost` - Today's cost
- `tokenStats.total.*` - Same fields for all-time total
- `tokenStats.rpm` - Requests per minute
- `tokenStats.tpm` - Tokens per minute

**Rate Limiting**:
- `rateLimit.windowSeconds` - Rate limit window duration
- `rateLimit.requestsUsed` - Requests used in current window
- `rateLimit.requestsLimit` - Request limit per window
- `rateLimit.costUsed` - Cost used in current window
- `rateLimit.costLimit` - Cost limit per window
- `rateLimit.remainingSeconds` - Seconds until window resets

---

## Example: sub2api

```json
{
  "provider": "sub2api",
  "displayName": "sub2api",
  "endpoint": {
    "path": "/v1/usage",
    "method": "GET"
  },
  "auth": {
    "type": "bearer-header"
  },
  "defaults": {
    "unit": "USD",
    "planName": "Unknown"
  },
  "detection": {
    "healthMatch": { "status": "ok" }
  },
  "responseMapping": {
    "billingMode": "subscription",
    "planName": "$.planName",
    "balance.remaining": "$.remaining",
    "balance.unit": "$.unit",
    "daily.used": "$.subscription.daily_usage_usd",
    "daily.limit": "$.subscription.daily_limit_usd",
    "weekly.used": "$.subscription.weekly_usage_usd",
    "weekly.limit": "$.subscription.weekly_limit_usd",
    "monthly.used": "$.subscription.monthly_usage_usd",
    "monthly.limit": "$.subscription.monthly_limit_usd",
    "tokenStats.today.requests": "$.usage.today.requests",
    "tokenStats.today.inputTokens": "$.usage.today.input_tokens",
    "tokenStats.total.cost": "$.usage.total.cost"
  }
}
```

---

## Provider Auto-Detection

The `detection` object configures automatic provider detection:

```json
{
  "detection": {
    "urlPatterns": ["/custom-api", "custom.example.com"],
    "healthMatch": { "status": "ok", "version": "*" }
  }
}
```

**Detection priority**:
1. `CC_STATUSLINE_PROVIDER` env override
2. In-memory cache
3. Disk cache (24h TTL)
4. URL pattern matching (`urlPatterns`)
5. Health probe (`healthMatch`)
6. Built-in fallback patterns
7. Default to `sub2api`

**Health Match**:
- Probes `<baseUrl>/health` or `<baseUrl>/v1/health`
- Matches response fields against `healthMatch`
- Use `"*"` to match any non-null value

---

## Lock File Mechanism

The `.endpoint-config.lock` file enforces restart requirement:

```json
{
  "hash": "abc123def456",
  "lockedAt": "2026-02-28T12:00:00Z"
}
```

**Behavior**:
- Lock file created on first run and `--install`
- Hash computed from all `api-config/*.json` files (deterministic)
- On each invocation:
  - If `currentHash === lockedHash` → normal operation
  - If `currentHash !== lockedHash` → **Path B2** (locked out)
    - Shows: `⚠ Endpoint config changed — run: cc-api-statusline --apply-config`
    - Serves from cache (does NOT fetch with new config)
    - Prevents accidental endpoint changes

**Applying Changes**:
```bash
# After editing api-config/*.json files
cc-api-statusline --apply-config
```

This updates the lock file and clears caches.

---

## Adding a Custom Provider

1. **Create config file**:
   ```bash
   ~/.claude/cc-api-statusline/api-config/my-provider.json
   ```

2. **Define endpoint config**:
   ```json
   {
     "provider": "my-provider",
     "displayName": "My API",
     "endpoint": { "path": "/usage", "method": "GET" },
     "auth": { "type": "bearer-header" },
     "detection": { "urlPatterns": ["my-api.com"] },
     "responseMapping": {
       "billingMode": "subscription",
       "daily.used": "$.usage.today",
       "daily.limit": "$.limits.daily"
     }
   }
   ```

3. **Apply config**:
   ```bash
   cc-api-statusline --apply-config
   ```

4. **Test**:
   ```bash
   ANTHROPIC_BASE_URL=https://my-api.com \
   ANTHROPIC_AUTH_TOKEN=your-token \
   cc-api-statusline --once
   ```

---

## Troubleshooting

**Config changes not taking effect?**
- Run `cc-api-statusline --apply-config` to update lock file

**Provider not detected?**
- Check `urlPatterns` in detection config
- Set `CC_STATUSLINE_PROVIDER=my-provider` to force provider
- Enable debug logging: `DEBUG=1 cc-api-statusline --once`

**Response fields not showing?**
- Verify JSONPath mapping with actual API response
- Check `defaults` object for missing field defaults
- Look at debug log for fetch errors

**See also**:
- `docs/spec-custom-providers.md` - Original custom provider spec
- `docs/implementation-handbook.md` - Implementation details
- `~/.claude/cc-api-statusline/debug.log` - Debug output (when `DEBUG=1`)
