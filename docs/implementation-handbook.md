# cc-api-statusline - Implementation Handbook (Current)

This handbook is the implementation source of truth for the current repository state.
It reflects code behavior in `src/` as of 2026-02-26.

## 0. Scope and Precedence

Use this precedence order when documents disagree:

1. `src/` code
2. this handbook (`docs/implementation-handbook.md`)
3. focused docs (`docs/ccstatusline-contract-reference.md`, `docs/perf-budget.md`, `docs/current-implementation.md`)
4. legacy/spec extracts (`docs/spec-*.md`)

This project currently implements a unified single-cycle execution model (not a daemon poll loop in `main.ts`).

## 1. Architecture Overview

Core pipeline:

`env/config -> provider resolve -> fetch/normalize -> cache -> render -> stdout`

Main modules:

- `src/main.ts`: CLI args, mode detection, env/config loading, provider resolution, cache read/write side effects
- `src/core/execute-cycle.ts`: pure decision engine (Path A/B/C/D)
- `src/providers/*`: adapter fetch + normalize per backend
- `src/services/config.ts`: config load/merge/validate/save
- `src/services/env.ts`: env + `settings.json` overlay
- `src/services/cache.ts`: cache IO, cache validity checks, config hash
- `src/renderer/*`: component rendering, colors, truncation, error states
- `src/types/*`: canonical data/config/cache types

## 2. Runtime and CLI Behavior

### 2.1 Invocation modes

Mode is determined in `main.ts`:

- `piped mode`: `!process.stdin.isTTY`
  - primary mode for ccstatusline custom command usage
  - stdin payload is accepted and discarded
- `tty once mode`: `--once`
  - one execution cycle, then exit
- `tty interactive placeholder`: TTY without `--once`
  - currently prints a placeholder message and exits

### 2.2 CLI flags

- `--help`, `-h`
- `--version`, `-v` (currently hardcoded as `v0.1.0`)
- `--once`
- `--config <path>`

### 2.3 Environment variables

Required:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`

Optional:

- `CC_STATUSLINE_PROVIDER`
- `CC_STATUSLINE_POLL` (seconds, min 5, default 30)
- `CC_STATUSLINE_TIMEOUT` (piped total timeout budget ms, default 1000)
- `CC_API_STATUSLINE_CACHE_DIR` (cache dir override)
- `CLAUDE_CONFIG_DIR` (for `settings.json` overlay path)

### 2.4 settings.json overlay precedence

`src/services/env.ts` behavior:

- reads `CLAUDE_CONFIG_DIR/settings.json` if set, else `~/.claude/settings.json`
- uses `settings.env` values when present
- precedence is `settings.env > process.env`

## 3. Configuration Model

### 3.1 Paths

- config dir: `~/.claude/cc-api-statusline`
- config file: `~/.claude/cc-api-statusline/config.json`
- cache dir default: `~/.claude/cc-api-statusline`
- cache file per base URL: `cache-<shortHash(baseUrl)>.json`

### 3.2 Defaults (from `DEFAULT_CONFIG`)

- `display.layout`: `standard`
- `display.displayMode`: `bar`
- `display.barSize`: `medium`
- `display.barStyle`: `classic`
- `display.separator`: ` | `
- `display.maxWidth`: `80` (percentage of terminal width)
- `display.clockFormat`: `24h`
- `pollIntervalSeconds`: `30`
- `pipedRequestTimeoutMs`: `800`

Default component visibility:

- enabled: `daily`, `weekly`, `monthly`, `balance`
- disabled: `tokens`, `rateLimit`, `plan`

### 3.3 Validation/clamping

`loadConfig()` clamps:

- `display.maxWidth` to `20..100`
- `pollIntervalSeconds` to `>=5`
- `pipedRequestTimeoutMs` to `>=100`

### 3.4 Atomic writes

`saveConfig()` writes to `<path>.tmp` then `rename()`.

## 4. Canonical Data Schemas

### 4.1 `NormalizedUsage`

All adapters return this shape:

- metadata (non-null):
  - `provider`
  - `billingMode` (`subscription` or `balance`)
  - `planName`
  - `fetchedAt` (ISO)
  - `resetSemantics`
- nullable data fields:
  - `daily`, `weekly`, `monthly` (`QuotaWindow | null`)
  - `balance` (`BalanceInfo | null`)
  - `resetsAt` (soonest reset)
  - `tokenStats`
  - `rateLimit`

Renderer behavior depends on null-tolerant semantics: missing data hides components, never crashes rendering.

### 4.2 `CacheEntry`

Cache entry fields:

- `version` (`CACHE_VERSION`)
- `provider`
- `baseUrl`
- `tokenHash`
- `configHash`
- `data` (`NormalizedUsage`)
- `renderedLine`
- `fetchedAt`
- `ttlSeconds`
- `errorState`

Validity checks (`services/cache.ts`):

- TTL not expired
- baseUrl match
- version match
- tokenHash match
- provider match (checked separately)

## 5. Provider Layer

## 5.1 sub2api (`src/providers/sub2api.ts`)

- request: `GET {baseUrl}/v1/usage`
- auth: `Authorization: Bearer {token}`
- billing mode detection:
  - has `subscription` object -> `subscription`
  - otherwise -> `balance`

Mapping highlights:

- subscription windows:
  - `daily_usage_usd` / `daily_limit_usd`
  - `weekly_usage_usd` / `weekly_limit_usd`
  - `monthly_usage_usd` / `monthly_limit_usd`
- window reset computation:
  - daily: next midnight UTC
  - weekly: next Monday 00:00 UTC
  - monthly: first of next month 00:00 UTC
- balance mode:
  - `remaining` mapped to `balance.remaining`
  - `remaining === -1` treated as unlimited
- token stats:
  - snake_case to camelCase mapping for today/total/rpm/tpm
- edge handling:
  - `429` returns minimal "quota exhausted" normalized object

## 5.2 claude-relay-service (`src/providers/claude-relay-service.ts`)

- request: `POST {baseUrl}/apiStats/api/user-stats`
- auth: JSON body `{ "apiKey": token }`
- expects response wrapper `success: true`

Mapping highlights:

- always `billingMode: subscription`
- daily quota:
  - `currentDailyCost` / `dailyCostLimit`
- weekly quota:
  - `weeklyOpusCost` / `weeklyOpusCostLimit`
  - reset computed from `weeklyResetDay` + `weeklyResetHour`
- monthly quota: not provided (`null`)
- rate limit window:
  - `rateLimitWindow` minutes converted to `windowSeconds`
  - limit values `<=0` normalized to `null` (unlimited)
- token stats:
  - total only (`today: null`)

## 5.3 custom providers (`src/providers/custom.ts`)

- config-driven provider definitions
- supported auth modes:
  - header auth
  - body auth
- response mapping via lightweight JSONPath resolver:
  - supports dot notation and numeric indexes
  - does not support wildcards/filters/recursive descent
- mapping normalizes into `NormalizedUsage`
- applies `0 -> null` limit normalization for daily/weekly/monthly in custom mapping path

## 5.4 autodetection (`src/providers/autodetect.ts`)

Resolution order:

1. `CC_STATUSLINE_PROVIDER` override
2. in-memory baseUrl cache hit
3. custom provider `urlPatterns`
4. built-in relay heuristics (`/apistats`, `relay`, `/api/user-stats`)
5. default fallback: `sub2api`

## 6. Secure HTTP Layer

`src/providers/http.ts` provides `secureFetch()` with hard guards:

- only `https://` allowed, except loopback `http://localhost|127.0.0.1|::1`
- redirect policy: `redirect: 'manual'`
- cross-domain redirect blocking
- response body cap: 1MB streaming read
- timeout: `AbortSignal.timeout(timeoutMs)`

Typed errors:

- `HttpError`
- `TimeoutError`
- `RedirectError`
- `ResponseTooLargeError`

## 7. Unified Execution Core (Path A/B/C/D)

`src/core/execute-cycle.ts` is the decision engine.

### Path A - rendered cache fast path

Conditions:

- cache valid
- provider matches
- `configHash` matches

Action:

- return cached `renderedLine`
- no fetch

### Path B - cache data re-render path

Conditions:

- cache valid + provider match
- rendered hash mismatch

Action:

- render from cached `data`
- return `cacheUpdate` with new `renderedLine` and `configHash`

### Path C - fetch path

Conditions:

- no valid cache for A/B
- time budget sufficient

Action:

- fetch via provider adapter
- render
- create new cache entry

TTL for new cache entry is derived from:

- `getEffectivePollInterval(config, env.pollIntervalOverride)`

### Path D - fallback path

Triggers:

- insufficient remaining budget
- fetch failure

Behavior:

- if stale cached line exists: render stale/error-indicated output path
- otherwise: `[loading...]` or standalone error output

## 8. Timeout and Budget Rules

In `main.ts`:

- piped timeout budget: `CC_STATUSLINE_TIMEOUT` or `1000`
- tty once budget: `10000`
- fetch timeout:
  - piped: `min(config.pipedRequestTimeoutMs ?? 800, timeoutBudgetMs - 100)`
  - tty once: `10000`

In `execute-cycle.ts`:

- execution deadline uses a 50ms tail buffer
- if remaining budget <= 50ms, skip fetch and fallback immediately

## 9. Renderer Model

## 9.1 Components

Supported components:

- `daily`, `weekly`, `monthly`
- `balance`
- `tokens`
- `rateLimit`
- `plan`

Component order:

- key order in `config.components` first
- omitted components appended in default order:
  - `daily -> weekly -> monthly -> balance -> tokens -> rateLimit -> plan`

## 9.2 Layout and display modes

Layouts:

- `standard`
- `compact`
- `minimal`
- `percent-first`

Display modes:

- `bar`
- `percentage`
- `icon-pct`

## 9.3 Colors and aliases

- ANSI named colors (normal + bright)
- hex colors (`#rgb`, `#rrggbb`)
- alias-based dynamic colors (`auto`, `chill`, or user-defined)
- per-part color overrides (`label`, `bar`, `value`, `countdown`)

For non-percentage components, alias resolution uses the alias `low` color.

## 9.4 Countdown

- supported formats: `auto`, `duration`, `time`
- configurable divider/prefix
- invalid or missing reset timestamps produce empty countdown text

## 9.5 Error rendering

Error states include:

- `network-error`, `auth-error`, `rate-limited`, `server-error`, `parse-error`, `provider-unknown`, `missing-env`
- transition states: `switching-provider`, `new-credentials`, `new-endpoint`, `auth-error-waiting`

Rules:

- transition states replace full output
- with cached output, non-transition errors append indicators
- without cache, non-transition errors replace output

## 9.6 Truncation

- terminal width from `process.stdout.columns` with fallback `80`
- `display.maxWidth` interpreted as percentage of terminal width
- truncation is ANSI-aware and appends `…`

## 10. ccstatusline Host Contract Notes

When used as a ccstatusline Custom Command:

- host pipes JSON to stdin; this tool ignores payload content
- host default timeout is typically 1000ms
- host may strip ANSI when `preserveColors` is false
- host non-zero exit handling can surface as `[Exit: N]`

Practical implication:

- prioritize fast output and avoid timeout paths in piped mode
- treat exit code semantics carefully for widget UX

## 11. Performance Guidance

Performance targets are maintained in `docs/perf-budget.md` and perf tests.

Current focus:

- Path A/B return well under host timeout budget
- fallback path must return quickly when network is unavailable
- avoid network fetch when deadline budget is already exhausted

## 12. Testing and Debugging

## 12.1 Core commands

- `bun run check`
- `bun run test`
- `bun run lint`
- `bun run build`

## 12.2 Debug credentials file

Use local debug credentials file:

- `/Users/liafo/Development/GitWorkspace/cc-api-statusline/.agent/debug.env`

Example local run:

```bash
set -a
source .agent/debug.env
set +a
bun run build
node ./dist/cc-api-statusline.js --once
```

PowerShell:

```powershell
Get-Content .agent/debug.env | ForEach-Object {
  if ($_ -match '^(.*?)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
bun run build
node .\dist\cc-api-statusline.js --once
```

Guidelines:

- never commit `.agent/debug.env`
- never log raw tokens
- use temporary env scope for manual tests

## 12.3 CI expectations

- tests build `dist` before execution
- E2E tests validate fast-path and re-render cache behavior
- perf tests enforce p95 thresholds for CLI invocation path

## 13. Known Gaps and Risks

1. `--version` remains hardcoded in `main.ts`
2. interactive TTY mode is placeholder-only
3. `executeCycle` fetch-failure path currently returns non-zero exit even when cached data exists; this can degrade ccstatusline widget UX (host may render `[Exit: N]`)
4. cache schema includes `errorState`, but fetch-created cache entries in `executeCycle` currently do not explicitly populate it

## 14. Change Checklist (for new features/refactors)

Before merging behavior changes:

1. preserve `NormalizedUsage` as the only renderer/cache input contract
2. preserve Path A/B/C/D semantics unless intentionally redesigned
3. keep poll default at 30s unless explicitly changed in code and docs together
4. verify host-timeout-safe behavior under piped execution
5. run `bun run check`
6. update this handbook and `docs/current-implementation.md` in same change
