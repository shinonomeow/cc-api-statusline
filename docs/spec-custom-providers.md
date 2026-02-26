> DEPRECATED REFERENCE: This document reflects pre-unified planning assumptions and may not match current code.
> Use docs/current-implementation.md as source of truth for new work.

# Custom Provider Definitions — Spec

> Extracted from `implementation-handbook.md` §4. Governs how users register arbitrary API backends.

---

## Overview

Beyond the two built-in providers (`sub2api`, `claude-relay-service`), users can define custom providers entirely via config. No code changes required.

---

## Config shape

```json
{
  "customProviders": {
    "my-proxy": {
      "id": "my-proxy",
      "displayName": "My Custom Proxy",

      "endpoint": "/api/usage",
      "method": "GET",
      "contentType": "application/json",

      "auth": {
        "type": "header",
        "header": "Authorization",
        "prefix": "Bearer "
      },

      "requestBody": null,

      "urlPatterns": ["my-proxy.example.com"],

      "responseMapping": {
        "billingMode":        "balance",
        "planName":           "$.data.plan",
        "balance.remaining":  "$.data.credits",
        "balance.unit":       "USD",

        "daily.used":         "$.data.usage.day",
        "daily.limit":        "$.data.limits.day",
        "daily.resetsAt":     "$.data.resets.daily",

        "weekly.used":        "$.data.usage.week",
        "weekly.limit":       "$.data.limits.week",
        "weekly.resetsAt":    "$.data.resets.weekly",

        "monthly.used":       "$.data.usage.month",
        "monthly.limit":      "$.data.limits.month",
        "monthly.resetsAt":   "$.data.resets.monthly",

        "tokenStats.today.requests":     "$.data.today.requests",
        "tokenStats.today.inputTokens":  "$.data.today.input",
        "tokenStats.today.outputTokens": "$.data.today.output",
        "tokenStats.today.cost":         "$.data.today.cost"
      }
    }
  }
}
```

---

## Field reference

### Top-level provider fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique provider identifier |
| `displayName` | string | no | Human label; defaults to `id` |
| `endpoint` | string | yes | Path appended to `ANTHROPIC_BASE_URL` |
| `method` | `"GET"` \| `"POST"` | yes | HTTP method |
| `contentType` | string | no | Request content-type; default `application/json` |
| `auth.type` | `"header"` \| `"body"` | yes | Where to send the token |
| `auth.header` | string | conditional | Header name when `type == "header"` |
| `auth.prefix` | string | no | Prefix before token value (e.g. `"Bearer "`) |
| `auth.bodyField` | string | conditional | JSON body key when `type == "body"` |
| `requestBody` | object \| null | no | Static JSON body (token is injected via `auth.bodyField`) |
| `urlPatterns` | string[] | no | Substring patterns for autodetect matching |
| `responseMapping` | object | yes | Maps response paths → `NormalizedUsage` fields |

### Response mapping

Keys are dot-paths into `NormalizedUsage`. Values are either:

- **String literal** — used as-is (e.g. `"USD"`, `"balance"`)
- **JSONPath expression** — starts with `$` (e.g. `"$.data.credits"`)

#### Path resolution rules

1. `$.field` → `response.field`
2. `$.field.nested` → `response.field.nested`
3. `$.field[0]` → first element of array `response.field`
4. If path resolves to `undefined` → field is `null` in `NormalizedUsage`
5. Numeric `0` in limit fields → treated as unlimited (`null`)

#### Supported mapping targets

All fields from the `NormalizedUsage` interface can be mapped. Most common:

```
billingMode
planName
balance.remaining
balance.unit
daily.used / daily.limit / daily.resetsAt
weekly.used / weekly.limit / weekly.resetsAt
monthly.used / monthly.limit / monthly.resetsAt
tokenStats.today.* / tokenStats.total.*
tokenStats.rpm / tokenStats.tpm
rateLimit.*
```

---

## Autodetect integration

Custom providers participate in autodetection via their `urlPatterns` array. The registry checks custom providers **before** built-in fallbacks:

```
1. For each customProvider where urlPatterns is non-empty:
     if ANTHROPIC_BASE_URL includes any pattern → match
2. Then check built-in providers (relay pattern → relay, else → sub2api)
```

---

## Validation rules

On config load, validate each custom provider:

- `endpoint` must start with `/`
- `method` must be `GET` or `POST`
- `auth.type` must be `header` or `body`
- If `auth.type == "header"`, `auth.header` is required
- If `auth.type == "body"`, `auth.bodyField` is required
- `responseMapping` must have at least `billingMode`
- Invalid providers are logged as warnings and skipped (never crash)

### Framework defaults for unmapped metadata

Custom providers must map `billingMode` (required), but other `NormalizedUsage` metadata fields have framework defaults when not mapped:

- `provider`: set to the custom provider's config key
- `planName`: defaults to `"Custom API"` if not mapped
- `fetchedAt`: set by framework at fetch time
- `resetSemantics`: defaults based on `billingMode`:
  - `"subscription"` → `"end-of-day"`
  - `"balance"` → `"expiry"`
  - Override by mapping `resetSemantics` in `responseMapping.metadata`

---

## Error handling for custom providers

- HTTP errors follow the same backoff/retry rules as built-in providers
- If response shape doesn't match mapping paths → treat as fetch failure, show error state
- If `billingMode` cannot be resolved → default to `"balance"`
