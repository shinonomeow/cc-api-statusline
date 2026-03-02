# Current Implementation (Snapshot)

> Last updated: 2026-03-02
> This file reflects the actual code in `src/`.
> For complete rules and implementation guidance, use `docs/implementation-handbook.md`.

## Runtime model

The runtime is a **single execution cycle per process invocation**.

Supported invocation paths:

- `piped` mode (`!process.stdin.isTTY`): primary production path for Claude/ccstatusline custom command usage
- `--once` mode (TTY): single fetch/render/exit for local debugging
- `--install` mode: register as Claude Code statusline widget in `~/.claude/settings.json`
- `--uninstall` mode: remove statusline widget registration
- interactive TTY without `--once`: prints a placeholder message and exits

There is currently **no long-running standalone polling daemon** in `src/main.ts`.

## Main flow

`src/main.ts` is a **thin router** (~98 lines). All logic is delegated to `src/cli/`:

1. discard stdin payload (for host compatibility)
2. `parseArgs()` — `src/cli/args.ts`
3. route to handler:
   - `--help` → `showHelp()` → exit 0
   - `--version` → `showVersion()` → exit 0
   - `--install` → `handleInstall(args)` — `src/cli/commands.ts`
   - `--uninstall` → `handleUninstall()` — `src/cli/commands.ts`
   - TTY + no `--once` → interactive placeholder
   - otherwise → `executePipedMode(args)` — `src/cli/piped-mode.ts`

### `executePipedMode` flow (`src/cli/piped-mode.ts`)

1. Detect output mode: `OutputMode = 'tty' | 'piped' | 'piped-embedded'`
   - Determined by: `isPiped ? (args.embedded ? 'piped-embedded' : 'piped') : 'tty'`
   - `args.embedded` resolved from `--embedded` flag or `CC_API_STATUSLINE_EMBEDDED` env var (accepts `'1'` or `'true'`)
2. Read `CC_STATUSLINE_TIMEOUT` (default 5000ms)
3. **Watchdog timer** (piped mode only): schedule `setTimeout` at `rawTimeoutMs - 100ms`; if fired, write `⟳ Refreshing...` to stdout and `process.exit(0)` — prevents `[Signal: SIGKILL]` from Claude Code
4. `buildExecutionContext(args)` — reads env, config, cache, resolves provider
5. run `executeCycle()` (`src/core/execute-cycle.ts`)
6. `formatOutput(output, outputMode)` — applies mode-specific formatting:
   - `'tty'`: append newline
   - `'piped'`: prepend ANSI reset + replace spaces with NBSP
   - `'piped-embedded'`: no host formatting (preserves color sequences for embedded use)
7. write cache if updated, exit with result code

## Unified execution core paths (`executeCycle`)

- **Path A**: valid cache + matching `configHash` + matching provider -> return cached `renderedLine`
- **Path B**: valid cache data but stale render hash -> re-render from cached normalized data
- **Path C**: stale/missing cache -> fetch, normalize, render, emit cache update
- **Path D**: insufficient budget or fetch failure -> fallback (stale render with error indicator, `[loading...]`, or error rendering)

### Exit code behavior

- Returns `0` when stale cache is shown with error indicators (output is still useful)
- Returns `1` only when no data can be shown (no cache, fetch failed)

## Key implementation facts

- Poll interval default is **30s** (`DEFAULT_CONFIG.pollIntervalSeconds`)
- Countdown divider default is **` · `** (space-dot-space)
- `CC_STATUSLINE_POLL` overrides poll interval (minimum 5) and is used for cache TTL derivation
- Config default path: `~/.claude/cc-api-statusline/config.json`
- Cache default directory/file: `~/.claude/cc-api-statusline/cache-<hash>.json`
- Debug log path: `~/.claude/cc-api-statusline/debug.log` (enabled with `DEBUG=1` or `CC_STATUSLINE_DEBUG=1`)
- `settings.json` overlay source:
  - `CLAUDE_CONFIG_DIR/settings.json` if `CLAUDE_CONFIG_DIR` is set
  - otherwise `~/.claude/settings.json`
- Cache writes are atomic (`.tmp` + `rename`) via `atomicWriteFile()` in `src/services/atomic-write.ts`
- Directory creation uses `ensureDir()` in `src/services/ensure-dir.ts` (mode 0700)
- Piped timeout budget uses `CC_STATUSLINE_TIMEOUT` (default `5000ms`)
- Version is read dynamically from `package.json`
- Shared constants live in `src/core/constants.ts`: `DEFAULT_TIMEOUT_BUDGET_MS`, `TTY_TIMEOUT_BUDGET_MS`, `EXIT_BUFFER_MS`, `TIMEOUT_HEADROOM_MS`, `STALENESS_THRESHOLD_MINUTES`, `VERY_STALE_THRESHOLD_MINUTES`, `DETECTION_TTL_BASE_S`, `DETECTION_TTL_MAX_S`, `DETECTION_TTL_CHANGED_S`, `DETECTION_TTL_FAILED_S`

## Debug logging

When enabled via `DEBUG=1` or `CC_STATUSLINE_DEBUG=1`, the logger (`src/services/logger.ts`) writes detailed execution logs to `~/.claude/cc-api-statusline/debug.log`.

**Log rotation** (`src/services/log-rotator.ts`): Called in the Logger constructor on each debug-enabled invocation (probabilistic: 1/20 chance). Rotation policy:
- Size ≥ 500 KB and age < 24h → rename to `debug.YYYY-MM-DDTHH-MM.log` (plain)
- Age ≥ 24h → rename then gzip in detached child process
- Cleanup pass: gzip plain archives older than 24h; delete `.log.gz` archives older than 3 days

- Execution start/finish with timestamps
- Mode detection (piped vs TTY)
- Environment variables (sanitized)
- Config and cache status
- Execution paths taken (A/B/C/D)
- Fetch timing and performance metrics
- Cache operations
- Error details with fallback behavior

View logs: `tail -f ~/.claude/cc-api-statusline/debug.log`

## Auto-setup commands

```bash
# Install as Claude Code statusline widget
node dist/cc-api-statusline.js --install
node dist/cc-api-statusline.js --install --runner bunx

# Uninstall
node dist/cc-api-statusline.js --uninstall
```

## Known gaps

1. Interactive TTY mode is still a placeholder path (future: TUI configuration interface)

## Testing status

- Full gate command: `bun run check`
- Current suite: **691 tests** / **39 files**
- Includes: unit tests, renderer tests, core path tests, settings tests, E2E smoke tests, perf tests
- CI/CD: GitHub Actions workflows for PR checks and npm publish on tags

## Authoritative code directories

- `src/main.ts` — thin router
- `src/cli/` — args, commands, piped-mode
- `src/core/` — execute-cycle, constants
- `src/providers/` — sub2api, relay, custom, autodetect, quota-window, custom-mapping
- `src/services/` — env, cache, config, settings, logger, log-rotator, atomic-write, ensure-dir
- `src/renderer/` — index (pipeline), component, context (RenderContext), bar, colors, divider, countdown, error, transition, format, icons, truncate
- `src/types/` — config (DEFAULT_COMPONENT_ORDER typed as ComponentId[], DEFAULT_TIER_THRESHOLDS [37.5, 62.5, 75, 87.5, 100], buildTiers() helper), cache (CacheErrorState), normalized-usage
