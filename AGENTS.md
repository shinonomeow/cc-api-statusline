# AGENTS.md — cc-api-statusline

## Mission

`cc-api-statusline` is a TypeScript/Bun CLI that renders a one-line API-usage statusline for Claude Code widgets (`ccstatusline` Custom Command) and local CLI usage.

Core pipeline:
`env/config -> provider detect -> fetch -> normalize -> cache -> render -> stdout`

---

## Current Status Snapshot (handoff-ready)

As of this repository state:

- Unified execution core is implemented (`src/core/execute-cycle.ts`) with Path A/B/C/D flow.
- Piped mode is the primary production path and is performance-gated.
- `--once` mode (TTY) is implemented for one-shot local fetch/render.
- Interactive TTY mode without `--once` is a placeholder message and exits.
- Full test suite is green via `bun run check`.

Known open items:

1. `--version` output is hardcoded in `src/main.ts`.
2. Interactive TTY mode is not implemented beyond placeholder output.

---

## Tech Stack

- Language: TypeScript
- Runtime: Bun (primary), Node-compatible output
- Build: `bun build src/main.ts --target=node --outfile=dist/cc-api-statusline.js`
- Tests: Vitest
- Lint: ESLint
- Runtime deps: none

---

## Commands (authoritative)

Use these commands in this order:

1. `bun run check` (full gate, preferred)
2. `bun run test` (build + vitest)
3. `bun run lint`
4. `bun run build`

`package.json` scripts:

- `test`: `bun run build && vitest run`
- `check`: `bun run test && bun run lint`

---

## Runtime/Path Conventions (actual code behavior)

- Config path default: `~/.claude/cc-api-statusline/config.json`
- Cache path default: `~/.claude/cc-api-statusline/cache-<hash>.json`
- `settings.json` overlay path:
  - `CLAUDE_CONFIG_DIR/settings.json` if `CLAUDE_CONFIG_DIR` is set
  - otherwise `~/.claude/settings.json`

Important: code currently uses `~/.claude/cc-api-statusline` for both config and cache.

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
| `CLAUDE_CONFIG_DIR` | No | `settings.json` overlay location |

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

### Renderer

- `src/renderer/colors.ts`
- `src/renderer/bar.ts`
- `src/renderer/countdown.ts`
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

1. Piped stdin is accepted and discarded (not used for provider data).
2. Fast path uses cached `renderedLine` when cache validity + provider + `configHash` match.
3. Config hash uses raw config bytes for fast-path checks.
4. Cache writes are atomic (`.tmp` + `rename`) and non-fatal.
5. Renderer is null-tolerant; missing fields degrade gracefully.
6. Piped mode must prefer fallback output over host timeout failure.

---

## Testing Notes

- Full suite currently: `333` tests across `20` files.
- Perf/E2E tests are hermetic:
  - build `dist` first via script,
  - isolate env (`CLAUDE_CONFIG_DIR`, `CC_API_STATUSLINE_CACHE_DIR`),
  - assert cache-path behavior.

If tests fail only when run in parallel sessions, re-run `bun run check` sequentially.

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

1. Run `bun run check` and confirm green.
2. Read authoritative docs first (`docs/README.md` -> `docs/implementation-handbook.md`).
3. Confirm open gaps (version sourcing, interactive TTY mode).
4. Preserve unified execution core behavior when refactoring.
5. Re-run `bun run check` before any completion claim.
