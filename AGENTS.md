# AGENTS.md — cc-api-statusline

## Mission

`cc-api-statusline` is a TypeScript/Bun CLI that renders a one-line API-usage statusline for Claude Code widgets (`ccstatusline` Custom Command) and local CLI usage.

Core pipeline:
`env/config -> provider detect -> fetch -> normalize -> cache -> render -> stdout`

---

## Current Status Snapshot (handoff-ready)

As of this repository state:

- **Production-ready** with auto-setup, debug logging, and CI/CD
- Unified execution core implemented (`src/core/execute-cycle.ts`) with Path A/B/C/D flow
- Piped mode is the primary production path with ANSI reset + NBSP formatting
- `--once` mode (TTY) implemented for one-shot local fetch/render
- `--install`/`--uninstall` commands for auto-setup in Claude Code
- Debug logging system (`DEBUG=1`) writes to `~/.claude/cc-api-statusline/debug.log`
- Dynamic version from `package.json`
- Exit code 0 when showing stale cache with error indicators (not confusing host)
- Full test suite green: **356 tests** across **21 files**
- GitHub Actions CI/CD for testing and npm publish

Known open items:

1. Interactive TTY mode is not implemented beyond placeholder output

---

## Tech Stack

- Language: TypeScript
- Runtime: Bun (primary), Node-compatible output
- Build: `bun build src/main.ts --target=node --outfile=dist/cc-api-statusline.js`
- Tests: Vitest
- Lint: ESLint
- Runtime deps: none
- CI/CD: GitHub Actions

---

## Commands (authoritative)

Use these commands in this order:

1. `bun run check` (full gate, preferred)
2. `bun run test` (build + vitest)
3. `bun run lint`
4. `bun run build`

`package.json` scripts:

- `start`: `bun run src/main.ts --once` (quick dev fetch)
- `dev`: `bun run src/main.ts` (TTY mode, future TUI)
- `example`: `cat docs/fixtures/ccstatusline-context.sample.json | bun run src/main.ts` (piped simulation)
- `test`: `bun run build && vitest run`
- `test:watch`: `vitest` (watch mode)
- `check`: `bun run test && bun run lint` (full gate)
- `build`: Build to dist/

---

## Runtime/Path Conventions (actual code behavior)

- Config path default: `~/.claude/cc-api-statusline/config.json`
- Cache path default: `~/.claude/cc-api-statusline/cache-<hash>.json`
- Debug log path: `~/.claude/cc-api-statusline/debug.log` (when `DEBUG=1`)
- `settings.json` overlay path:
  - `CLAUDE_CONFIG_DIR/settings.json` if `CLAUDE_CONFIG_DIR` is set
  - otherwise `~/.claude/settings.json`

Important: code currently uses `~/.claude/cc-api-statusline` for config, cache, and logs.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_BASE_URL` | Yes | Provider base URL |
| `ANTHROPIC_AUTH_TOKEN` | Yes | Provider token/key |
| `CC_STATUSLINE_PROVIDER` | No | Provider override |
| `CC_STATUSLINE_POLL` | No | Poll interval override (seconds, default 30) |
| `CC_STATUSLINE_TIMEOUT` | No | Piped-mode timeout budget ms (default `1000`) |
| `CC_API_STATUSLINE_CACHE_DIR` | No | Cache dir override (tests/dev) |
| `CC_API_STATUSLINE_LOG_DIR` | No | Debug log dir override |
| `CLAUDE_CONFIG_DIR` | No | `settings.json` overlay location |
| `DEBUG` or `CC_STATUSLINE_DEBUG` | No | Enable debug logging |

Security rule: never log or persist plaintext tokens.

---

## Architecture Map

### Entry

- `src/main.ts`

### Core

- `src/core/execute-cycle.ts` (unified single-cycle decision engine)
- `src/core/types.ts`
- `src/core/index.ts`

### Providers

- `src/providers/http.ts` (security guards, size cap, redirect handling)
- `src/providers/sub2api.ts`
- `src/providers/claude-relay-service.ts`
- `src/providers/custom.ts`
- `src/providers/autodetect.ts`
- `src/providers/index.ts`

### Services

- `src/services/env.ts`
- `src/services/config.ts`
- `src/services/cache.ts`
- `src/services/hash.ts`
- `src/services/settings.ts` (Claude Code settings.json management)
- `src/services/logger.ts` (debug logging system)

### Renderer

- `src/renderer/colors.ts`
- `src/renderer/bar.ts`
- `src/renderer/countdown.ts` (default divider: ` · ` space-dot-space)
- `src/renderer/icons.ts`
- `src/renderer/component.ts`
- `src/renderer/error.ts`
- `src/renderer/truncate.ts`
- `src/renderer/index.ts`

### Types

- `src/types/normalized-usage.ts`
- `src/types/config.ts`
- `src/types/cache.ts`
- `src/types/index.ts`

---

## Behavior Guarantees To Preserve

1. Piped stdin is accepted and discarded (not used for provider data)
2. Fast path uses cached `renderedLine` when cache validity + provider + `configHash` match
3. Config hash uses raw config bytes for fast-path checks
4. Cache writes are atomic (`.tmp` + `rename`) and non-fatal
5. Renderer is null-tolerant; missing fields degrade gracefully
6. Piped mode must prefer fallback output over host timeout failure
7. Piped mode applies ANSI reset (`\x1b[0m`) and NBSP replacement for Claude Code compatibility
8. Exit code 0 when stale cache shown with error indicators (avoids confusing `[Exit: 1]` in widget)

---

## Testing Notes

- Full suite currently: **356 tests** across **21 files**
- Perf/E2E tests are hermetic:
  - build `dist` first via script
  - isolate env (`CLAUDE_CONFIG_DIR`, `CC_API_STATUSLINE_CACHE_DIR`)
  - assert cache-path behavior
- Performance target: p95 < 600ms (protects 1s piped timeout budget)

If tests fail only when run in parallel sessions, re-run `bun run check` sequentially.

---

## Debug Logging

Enable with `DEBUG=1` or `CC_STATUSLINE_DEBUG=1`:

```bash
# View logs in real-time
tail -f ~/.claude/cc-api-statusline/debug.log

# Enable for Claude Code widget
# In ~/.claude/settings.json:
{
  "statusLine": {
    "type": "command",
    "command": "DEBUG=1 bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

Logs include: execution paths, fetch timing, cache operations, error details.

---

## Auto-Setup Commands

```bash
# Install as Claude Code statusline widget
node dist/cc-api-statusline.js --install
node dist/cc-api-statusline.js --install --runner bunx

# Uninstall
node dist/cc-api-statusline.js --uninstall
```

---

## Docs To Read First (authoritative)

1. `docs/README.md`
2. `docs/implementation-handbook.md`
3. `docs/current-implementation.md`
4. `docs/ccstatusline-contract-reference.md`
5. `docs/perf-budget.md`
6. `docs/spec-api-polling.md`
7. `docs/spec-tui-style.md`
8. `docs/spec-custom-providers.md`

---

## External Reference Repos

- `/Users/liafo/Development/GitWorkspace/ccstatusline`
- `/Users/liafo/Development/GitWorkspace/sub2api`
- `/Users/liafo/Development/GitWorkspace/claude-relay-service`
- `/Users/liafo/Development/GitWorkspace/claude-pulse`
- `/Users/liafo/Development/GitWorkspace/ccusage`
- `/Users/liafo/Development/GitWorkspace/CCometixLine`

---

## Takeover Checklist For New Agent

1. Run `bun run check` and confirm green (356 tests)
2. Read authoritative docs first (`docs/README.md` -> `docs/implementation-handbook.md`)
3. Confirm remaining gap: interactive TTY mode placeholder
4. Preserve unified execution core behavior when refactoring
5. Preserve exit code semantics (0 for stale cache, 1 only for no-data errors)
6. Preserve piped mode formatting (ANSI reset + NBSP)
7. Re-run `bun run check` before any completion claim
