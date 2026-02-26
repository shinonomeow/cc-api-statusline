# ccstatusline Host Contract Reference

> Source-backed contract notes for `cc-api-statusline` when run as a ccstatusline Custom Command.

---

## 1) Process Invocation Contract

ccstatusline invokes custom commands with Node `execSync` and:

- `input: JSON.stringify(context.data)`
- `timeout: item.timeout ?? 1000`
- `stdio: ['pipe', 'pipe', 'ignore']`
- `env: process.env`

Implications:

- stdin payload is JSON text and must be accepted without blocking.
- timeout is enforced by the host process (default 1000ms).
- command `stderr` is ignored by host.
- host forwards environment as-is; it does not inject a dedicated timeout env variable.

---

## 2) Output Handling Contract

Host behavior on command output:

- host applies `.trim()` to stdout content.
- if `preserveColors` is false, host strips SGR color/style codes with:
  `output.replace(/\x1b\[[0-9;]*m/g, '')`
- optional `maxWidth` truncation is applied by host after command completion.

Implications:

- produce a single-line status string as a best practice (host does not strictly enforce single-line output).
- avoid non-SGR ANSI controls (cursor movement, clear-screen, etc.).
- for color output in widget mode, user must enable `preserveColors`.

**Important**: When `preserveColors: true` is set and `maxWidth` is configured, the host's truncation check (`output.length > item.maxWidth`) counts **byte length including ANSI escape sequences**, not visible character count. This means:

- ANSI codes inflate the byte length and can cause premature truncation.
- Commands should account for host-side truncation by keeping total output (including ANSI bytes) under the host's `maxWidth`.
- Alternatively, perform ANSI-aware truncation internally before outputting to stdout, ensuring the visible character count plus ANSI overhead stays within the host's limit.

---

## 3) Error Surface Contract

On failures, host maps errors to fixed tokens:

- `ENOENT` -> `[Cmd not found]`
- `ETIMEDOUT` -> `[Timeout]`
- `EACCES` -> `[Permission denied]`
- process signal -> `[Signal: <name>]`
- non-zero exit status -> `[Exit: N]`
- fallback -> `[Error]`

Implications:

- command should use non-zero exits only for actionable error states.
- command should prefer fast fallback output to reduce timeout risk.

---

## 4) Config and Cache Conventions in ccstatusline

Patterns used by ccstatusline itself:

- app settings path: `~/.config/ccstatusline/settings.json`
- cache directory pattern: `~/.cache/ccstatusline/`
- Claude settings path resolved via `CLAUDE_CONFIG_DIR` fallback to `~/.claude/settings.json`

Implications for `cc-api-statusline`:

- keep chosen aux-project pathing explicit and consistent in all docs.
- document any divergence from ccstatusline conventions in one place.

---

## 5) Planning Notes for cc-api-statusline

For implementation planning, treat these as non-negotiable:

1. piped mode must return quickly under 1000ms default host timeout.
2. command must accept stdin JSON but does not need to use it for provider data.
3. color behavior must degrade cleanly when `preserveColors` is false.
4. do not assume host sets `CC_STATUSLINE_TIMEOUT`; use safe default budget unless explicitly overridden.

