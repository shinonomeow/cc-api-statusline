# Current Implementation (Snapshot)

> Last updated: 2026-02-27
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

`src/main.ts` is a **thin router** (~78 lines). All logic is delegated to `src/cli/`:

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

1. `buildExecutionContext(args)` — reads env, config, cache, resolves provider
2. run `executeCycle()` (`src/core/execute-cycle.ts`)
3. `formatOutput(output, isPiped)` — prepend ANSI reset, replace spaces with NBSP in piped mode
4. write cache if updated, exit with result code

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
- Piped timeout budget uses `CC_STATUSLINE_TIMEOUT` (default `1000ms`)
- Version is read dynamically from `package.json`
- Shared constants live in `src/core/constants.ts`: `EXIT_BUFFER_MS`, `LOADING_FALLBACK`, `DEFAULT_FETCH_TIMEOUT_MS`, `STALENESS_THRESHOLD_MINUTES`, `VERY_STALE_THRESHOLD_MINUTES`

## Debug logging

When enabled via `DEBUG=1` or `CC_STATUSLINE_DEBUG=1`, the logger (`src/services/logger.ts`) writes detailed execution logs to `~/.claude/cc-api-statusline/debug.log`:

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
- Current suite: **477 tests** / **30 files**
- Includes: unit tests, renderer tests, core path tests, settings tests, E2E smoke tests, perf tests
- CI/CD: GitHub Actions workflows for PR checks and npm publish on tags

## Authoritative code directories

- `src/main.ts` — thin router
- `src/cli/` — args, commands, piped-mode
- `src/core/` — execute-cycle, constants
- `src/providers/` — sub2api, relay, custom, autodetect, quota-window, custom-mapping
- `src/services/` — env, cache, config, settings, logger, atomic-write, ensure-dir
- `src/renderer/` — component (RenderContext), bar, colors, countdown, error, transition, icons, truncate
- `src/types/` — config (DEFAULT_COMPONENT_ORDER typed as ComponentId[]), cache (CacheErrorState), normalized-usage
