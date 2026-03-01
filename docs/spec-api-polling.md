> Supplemental reference for polling/caching details.
> Source of truth is `docs/implementation-handbook.md` plus `src/`.

# API Polling & Caching — Spec

> Extracted from `implementation-handbook.md` §5. Governs polling intervals, caching, backoff, and startup behavior.

---

## Polling Loop

### Parameters

| Parameter | Default | Config key | Env override |
|---|---|---|---|
| Poll interval | 30 s | `pollIntervalSeconds` | `CC_STATUSLINE_POLL` |
| Request timeout (poll loop) | 5 s | `requestTimeoutSeconds` | — |
| Piped-mode request timeout | 3000 ms | `pipedRequestTimeoutMs` | — |
| Max consecutive failures | 5 | `maxConsecutiveFailures` | — |
| Pause duration after max failures | 300 s (5 min) | `pauseDurationSeconds` | — |

### Loop behavior

```
loop:
  0. Check for env changes (read ~/.claude/settings.json):
       - Compare ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN against envSnapshot
       - If either changed:
           → update envSnapshot
           → emit transition indicator (see Provider Switch Transition)
           → if token changed: reset auth-error state + reset failure counter
           → if baseUrl changed: invalidate provider detection cache
           → skip step 1 and proceed immediately to step 2
  1. Wait pollIntervalSeconds
  2. Attempt fetch via current provider adapter
  3. On success:
       - Normalize response → NormalizedUsage
       - Write to disk cache (atomic)
       - Reset failure counter
       - Invoke renderer with new data
  4. On failure:
       - Increment failure counter
       - Apply backoff delay for next attempt
       - If cached data exists → renderer uses cached data + staleness indicator
       - If no cached data → renderer shows error state
       - If failure counter >= maxConsecutiveFailures → pause for pauseDurationSeconds
```

### Exponential backoff schedule

| Attempt | Delay before retry |
|---|---|
| 1 | 5 s |
| 2 | 10 s |
| 3 | 20 s |
| 4 | 40 s |
| 5+ | 60 s (cap) |

After `maxConsecutiveFailures` (default 5), polling pauses entirely for `pauseDurationSeconds`. After pause, counter resets and polling resumes from attempt 1.

### Error classification

| HTTP status | Behavior |
|---|---|
| `200` | Success — normalize and cache |
| `401`, `403` | Auth/access error — halt polling; show `⚠ Auth error`; resume automatically if env change detected (see Auth Error Recovery) |
| `429` | Rate limited — apply backoff, show rate-limited indicator (sub2api & custom providers; relay uses in-band limits) |
| `500` | Server error — apply backoff, retry |
| Network error | Apply backoff, retry |
| Invalid JSON / parse error | Treat as server error, apply backoff |

> **Note**: The relay provider (`claude-relay-service`) handles rate limiting **in-band** via `limits` fields in the success response, not via HTTP 429. HTTP 429 handling applies to sub2api and custom providers.

### Request safety

| Guard | Implementation | Rationale |
|---|---|---|
| **Max response size** | `resp.read(1_048_576)` — cap at 1 MB | Prevent memory exhaustion from broken/malicious proxies |
| **Request timeout** | `requestTimeoutSeconds` (default 5s) per request | Prevent hanging on unresponsive servers |

> **Why HTTPS enforcement and redirect blocking were removed**: Claude Code itself already sends the user's API token to `ANTHROPIC_BASE_URL` before cc-api-statusline ever runs. If a user configures a malicious or HTTP URL, the token is already gone. Our HTTPS/redirect guards were closing the barn door after the horse was gone. The remaining guards (response size cap and timeout) protect our own process from misbehaving endpoints, not the user's token.

---

## Disk Cache

### Cache location

```
~/.claude/cc-api-statusline/
  cache-<hash(baseUrl)>.json
```

Hash: first 12 chars of SHA-256 of the base URL. One cache file per distinct `ANTHROPIC_BASE_URL`.

### Cache schema

```json
{
  "version": 1,
  "provider": "sub2api",
  "baseUrl": "https://proxy.example.com",
  "tokenHash": "a1b2c3d4",
  "fetchedAt": "2026-02-26T12:00:00Z",
  "ttl": 30,
  "configHash": "a1b2c3d4",
  "errorState": null,
  "data": { "...NormalizedUsage..." },
  "renderedLine": "Daily ━━━━──── 24%·3h12m | Weekly ..."
}
```

- `renderedLine` — last fully-rendered statusline string (with ANSI codes). In piped mode, if cache is fresh AND `configHash` matches, output this directly — skip all processing.
- `configHash` — first 8 chars of SHA-256 of raw config file bytes. In piped fast path, compute this hash without full JSON parse/merge/validation. If config changed since last render, `renderedLine` is stale and a re-render is needed (but cached `data` is still valid).
- `tokenHash` (**new**) — first 8 chars of SHA-256 of `ANTHROPIC_AUTH_TOKEN` at fetch time. Enables piped mode to detect token-only changes across invocations without storing the actual token.
- `errorState` (**new**) — `null` (no error) or `{ "type": "auth", "httpStatus": 401 }`. Enables piped mode to know the last fetch failed with an auth error and attempt recovery if the token changed.

### Cache validity

Cache is valid when:
1. `Date.now() - fetchedAt < ttl * 1000`
2. `provider` matches current detected/configured provider
3. `baseUrl` matches current `ANTHROPIC_BASE_URL`
4. `version` matches current cache schema version
5. `tokenHash` matches first 8 chars of SHA-256 of current `ANTHROPIC_AUTH_TOKEN`

If any condition fails → cache is stale → trigger immediate fetch.

> **Piped mode — auth error recovery**: if `errorState.type === "auth"` AND condition 5 fails (token changed), attempt a fresh fetch instead of re-displaying the cached auth error.

### Write behavior

- **Atomic writes**: write to `cache-<hash>.json.tmp`, then `rename()` over `cache-<hash>.json`
- **File permissions**: `0600` on Unix (owner read+write only). On Windows, rely on user-profile directory ACLs.
- **Never block rendering**: cache writes are fire-and-forget; if write fails, log warning and continue

---

## Startup Sequence

```
1. Read ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN from process.env,
   then overlay with ~/.claude/settings.json env field if present;
   capture initial envSnapshot = { baseUrl, tokenHash, provider }
2. If either is missing → render error state and exit
3. Compute cache path: ~/.claude/cc-api-statusline/cache-<hash(baseUrl)>.json
4. Read cache file (single disk read)
5. PIPED-MODE FAST PATH:
     a. If cache is fresh AND configHash matches → output renderedLine, exit
     b. (No full config parse/merge, no provider detection, no rendering needed)
6. Load config from ~/.claude/cc-api-statusline/config.json
7. Detect or select provider
8. If cache data is valid (but renderedLine stale due to config change):
     a. Re-render from cached data, output, update cache
9. If cache is stale or missing:
     a. Perform synchronous fetch (respecting deadline budget)
     b. On success → render + cache + output
     c. On failure → render error state + output
10. If running in poll mode (standalone) → enter polling loop
11. If running in piped mode → exit after output
```

### Piped vs standalone detection

| Condition | Mode |
|---|---|
| stdin is a TTY and no data piped | Standalone (poll loop) |
| stdin has data (piped) | Piped (render once, exit) |
| `--once` flag | Single fetch + render, exit |

### Piped-mode deadline algorithm

Piped mode has a strict host timeout in ccstatusline (default 5000 ms via widget config).

`requestTimeoutSeconds` governs poll-loop fetches only. Piped mode uses a separate timeout (`pipedRequestTimeoutMs`, default 3000 ms) so a network fetch can complete within the ccstatusline budget.

```
timeoutMs       = Number(process.env.CC_STATUSLINE_TIMEOUT ?? 5000)
                // CC_STATUSLINE_TIMEOUT is optional for local testing;
                // ccstatusline does not inject it automatically
deadline        = startTime + timeoutMs - 50        // 50ms process-exit buffer
remainingBudget = deadline - Date.now()
pipedFetchTimeout = min(remainingBudget - 50, pipedRequestTimeoutMs)
                                                    // 50ms buffer for rendering + output

Priority:
1. renderedLine from cache (fresh + configHash match) → ~0ms, output and exit
2. cached data + re-render (config changed) → ~5ms, no network
3. network fetch (cache stale) → only if pipedFetchTimeout > 0;
                                   use pipedFetchTimeout as the request timeout
4. fallback → output "[loading...]" if nothing available within budget
```

Example with defaults (`timeoutMs = 5000`, `pipedRequestTimeoutMs = 3000`):
- `remainingBudget ≈ 4950ms` → `pipedFetchTimeout = min(4900, 3000) = 3000ms`
- Guard `3000 > 0` → fetch is attempted with a 3000ms deadline

Never start a network fetch if `pipedFetchTimeout ≤ 0`. Prefer stale cached data over risking a timeout.

> **tokenHash mismatch**: if the computed `tokenHash` of the current `ANTHROPIC_AUTH_TOKEN` differs from `cache.tokenHash`, treat the cache as invalid regardless of TTL and proceed to a fresh fetch. This handles the case where cc-switch (or another tool) has rotated the token since the last successful fetch.

---

## Environment Change Detection

> Applies to **standalone (poll loop) mode** only. In piped mode, each invocation is a fresh process spawned by Claude Code, which re-reads env from settings.json automatically.

### Why settings.json, not process.env

In Node/Bun, `process.env` is frozen at process start. External tools like cc-switch write new credentials to `~/.claude/settings.json`, not to the running process's environment. Reading settings.json on each poll cycle is the only reliable way to detect credential changes without restarting the process.

### Algorithm

```
// State (initialized at startup):
let envSnapshot = { baseUrl, tokenHash, provider }

function readCurrentEnv():
  base = {
    baseUrl:   process.env.ANTHROPIC_BASE_URL,
    tokenHash: sha256(process.env.ANTHROPIC_AUTH_TOKEN ?? "").slice(0, 8)
  }
  try:
    settings = JSON.parse(readFile("~/.claude/settings.json"))
    // settings.json values override process.env (matches Claude Code's behavior)
    if settings.env?.ANTHROPIC_BASE_URL:
      base.baseUrl = settings.env.ANTHROPIC_BASE_URL
    if settings.env?.ANTHROPIC_AUTH_TOKEN:
      base.tokenHash = sha256(settings.env.ANTHROPIC_AUTH_TOKEN).slice(0, 8)
  catch:
    // file missing or invalid JSON — use process.env values only
  return base

function checkForEnvChanges():
  newSnapshot = readCurrentEnv()
  if newSnapshot.baseUrl !== envSnapshot.baseUrl OR
     newSnapshot.tokenHash !== envSnapshot.tokenHash:
    changes = diff(envSnapshot, newSnapshot)
    envSnapshot = newSnapshot
    emitTransitionState(changes)        // show visual indicator
    if changes.tokenChanged:
      resetAuthErrorState()             // exit AUTH_ERROR_HALTED state
      resetFailureCounter()
    if changes.baseUrlChanged:
      invalidateProviderDetectionCache()
    return FETCH_IMMEDIATELY            // skip poll interval wait
  return FETCH_NORMAL
```

### Auth error state while halted

While in `AUTH_ERROR_HALTED` state, the polling engine does **not** poll. Instead, it only calls `checkForEnvChanges()` on each would-be cycle. When a token change is detected, it transitions to `RECOVERY_FETCH`.

> **Known limitation**: cc-switch **Proxy Takeover Mode** is not compatible with cc-api-statusline. Proxy Takeover routes by path pattern (`/v1/messages`, `/v1/chat/completions`), but cc-api-statusline calls different endpoints (`/usage`, `/api/.../stats`) that don't match these patterns. Use cc-switch **Direct Mode** instead, which writes to `~/.claude/settings.json` and is detected automatically by the env change mechanism above.

---

## Provider Switch Transition

When an env change is detected, the tool emits a brief visual indicator before the next fetch resolves.

### Transition indicator states

| Trigger | Display | Duration |
|---|---|---|
| `baseUrl` changed | `⟳ Switching provider...` | Until next successful fetch |
| Token changed (same URL) | `⟳ New credentials, refreshing...` | Until next successful fetch |
| `baseUrl` changed (catch-all) | `⟳ New endpoint, refreshing...` | Until next successful fetch |

- `⟳` (U+27F3) — transition icon
- Dim/muted coloring (same as `[stale]` indicator)
- Replaced by normal output on next successful fetch

### Lifecycle

```
ENV_CHANGE detected
  → emitTransitionState()  // show ⟳ indicator immediately
  → perform fetch with new credentials
  → (success) → show normal output, clear indicator
  → (auth error) → AUTH_ERROR_HALTED with new credentials
  → (other error) → normal backoff, indicator persists until success
```

### Piped mode

In piped mode, each invocation is a fresh process. If `cache.baseUrl !== currentBaseUrl` or `cache.tokenHash !== currentTokenHash`, output the appropriate transition indicator for that invocation and attempt a fresh fetch. The next invocation will have a fresh cache.

---

## Auth Error Recovery

Replaces the previous dead-end behavior where `401/403` permanently halted polling.

### State machine

```
POLLING ──(401/403)──→ AUTH_ERROR_HALTED
  AUTH_ERROR_HALTED ──(env change: token differs)──→ RECOVERY_FETCH
  RECOVERY_FETCH ──(success)──→ POLLING            [reset failure counter]
  RECOVERY_FETCH ──(401/403)──→ AUTH_ERROR_HALTED  [no backoff waste]
  RECOVERY_FETCH ──(other error)──→ normal backoff → POLLING
```

### Behavior in AUTH_ERROR_HALTED

- Does **not** retry polling
- Calls `checkForEnvChanges()` on each would-be cycle interval
- Shows `⚠ Auth error` display with dim `⟳ Waiting for new credentials...` hint

### Behavior in RECOVERY_FETCH

- Emits transition indicator (`⟳ New credentials, refreshing...`)
- Performs a single fetch attempt with updated credentials
- On success: clears auth error state, resets failure counter, resumes `POLLING`
- On continued auth failure: returns to `AUTH_ERROR_HALTED` (no backoff wasted on known-bad creds)
- On other failure (network, 500, etc.): enters normal backoff → `POLLING`

---

## Usage History (future)

> Not in v1 scope. Documented here for future implementation.

Track usage samples over time to power sparklines and runway estimation.

### History file

```
~/.claude/cc-api-statusline/history-<hash(baseUrl)>.json
```

Array of samples, each `{ "t": <unix_timestamp>, "daily": <pct>, "weekly": <pct> }`.

- **Max age**: 24 hours — prune entries older than this on each write
- **Max entries**: 2000 — cap to prevent unbounded growth
- **Write frequency**: once per poll cycle (every `pollIntervalSeconds`)

### Sparkline component

Renders last N samples as a Unicode sparkline: `▁▂▃▅▇▅▃▂`

Uses block elements `▁▂▃▄▅▆▇█` mapped from 0–100% usage.

### Runway estimation

Linear regression over last 10 minutes of samples → predict time until 100% usage.

- `slope = Δpct / Δtime` (pct per second)
- If slope ≤ 0 → usage flat/declining, no runway shown
- If runway > 24h → not useful, hide
- Display: `~2h 15m` or `~45m`

### Velocity

Compute burn rate from last 5 minutes: `pct/min`. Display as trend indicator.
