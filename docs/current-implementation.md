# Current Implementation (Snapshot)

> Last updated: 2026-02-26
> This file reflects the actual code in `src/`.
> For complete rules and implementation guidance, use `docs/implementation-handbook.md`.

## Runtime model

The runtime is a **single execution cycle per process invocation**.

Supported invocation paths:

- `piped` mode (`!process.stdin.isTTY`): primary production path for Claude/ccstatusline custom command usage
- `--once` mode (TTY): single fetch/render/exit for local debugging
- interactive TTY without `--once`: prints a placeholder message and exits

There is currently **no long-running standalone polling daemon** in `src/main.ts`.

## Main flow

`src/main.ts` is a thin orchestrator:

1. parse args (`--help`, `--version`, `--once`, `--config`)
2. discard stdin payload (for host compatibility)
3. read env + `settings.json` overlay (`src/services/env.ts`)
4. validate required env
5. load config + compute config hash
6. resolve provider + adapter
7. read cache entry for `ANTHROPIC_BASE_URL`
8. build `ExecutionContext`
9. run `executeCycle()` (`src/core/execute-cycle.ts`)
10. apply side effects (`stdout.write`, optional `writeCache`, `process.exit`)

## Unified execution core paths (`executeCycle`)

- **Path A**: valid cache + matching `configHash` + matching provider -> return cached `renderedLine`
- **Path B**: valid cache data but stale render hash -> re-render from cached normalized data
- **Path C**: stale/missing cache -> fetch, normalize, render, emit cache update
- **Path D**: insufficient budget or fetch failure -> fallback (stale render, `[loading...]`, or error rendering)

## Key implementation facts

- Poll interval default is **30s** (`DEFAULT_CONFIG.pollIntervalSeconds`)
- `CC_STATUSLINE_POLL` overrides poll interval (minimum 5) and is used for cache TTL derivation
- Config default path: `~/.claude/cc-api-statusline/config.json`
- Cache default directory/file: `~/.claude/cc-api-statusline/cache-<hash>.json`
- `settings.json` overlay source:
  - `CLAUDE_CONFIG_DIR/settings.json` if `CLAUDE_CONFIG_DIR` is set
  - otherwise `~/.claude/settings.json`
- Cache writes are atomic (`.tmp` + `rename`) and non-fatal
- Piped timeout budget uses `CC_STATUSLINE_TIMEOUT` in `main.ts` (default `1000ms`)

## Known gaps

1. `--version` output is hardcoded in `src/main.ts`
2. Interactive TTY mode is still a placeholder path
3. Legacy handbook/spec docs describe pre-unified/poll-loop behavior and are deprecated

## Testing status

- Full gate command: `bun run check`
- Current suite: `333` tests / `20` files
- Includes: unit tests, renderer tests, core path tests, E2E smoke tests, perf tests

## Authoritative code directories

- `src/main.ts`
- `src/core/`
- `src/providers/`
- `src/services/`
- `src/renderer/`
- `src/types/`
