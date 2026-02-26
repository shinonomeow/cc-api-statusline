# AGENTS.md — cc-api-statusline

## Mission

`cc-api-statusline` is a TypeScript/Bun CLI that renders a one-line API-usage statusline for Claude Code widgets (`ccstatusline` Custom Command) and standalone CLI usage.

Core pipeline:
`env/config -> provider detect -> fetch -> normalize -> cache -> render -> stdout`

---

## Current Status Snapshot (handoff-ready)

As of this repository state:

- Core implementation exists for providers, normalization, caching, rendering, and CLI wiring.
- Piped mode is production-focused and performance-gated.
- Standalone continuous polling loop is **not implemented yet** in `src/main.ts` (TODO branch still present).
- Test suite is green via `bun run check`.
- Coverage includes:
  - unit tests (types/services/providers/renderer),
  - CLI smoke tests,
  - perf tests with cache-path assertions.

Known open items:

1. Standalone loop integration (`src/main.ts` currently exits with "not yet implemented").
2. `--version` string is hardcoded (does not read `package.json`).

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
| `CC_STATUSLINE_POLL` | No | Poll interval override (seconds) |
| `CC_STATUSLINE_TIMEOUT` | No | Piped-mode total timeout ms (default `1000`) |
| `CC_API_STATUSLINE_CACHE_DIR` | No | Cache dir override (mainly tests/dev) |
| `CLAUDE_CONFIG_DIR` | No | `settings.json` overlay location |

Security rule: never log or persist plaintext tokens.

---

## Architecture Map

### Entry
- `src/main.ts`

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
- `src/services/polling.ts` (state machine exists; not fully wired as standalone loop in main)

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

---

## Behavior Guarantees To Preserve

1. Piped stdin is ignored (read/discard only for compatibility).
2. Fast path uses cached `renderedLine` when cache validity + `configHash` match.
3. Config hash uses raw config bytes (no parse required for fast-path check).
4. Cache writes are atomic (`.tmp` + `rename`) and non-fatal.
5. Renderer is null-tolerant; missing fields should degrade gracefully.
6. Piped-mode fallback should still output quickly within budget.

---

## Testing Notes

- Full suite currently: `333` tests across `20` files.
- Network in runtime verification can be unavailable; tests handle transient network fetch failures as acceptable.
- Perf/E2E tests are now hermetic:
  - build `dist` first via script,
  - isolate env (`CLAUDE_CONFIG_DIR`, `CC_API_STATUSLINE_CACHE_DIR`),
  - assert actual cache path behaviors.

If tests fail only when run in parallel sessions, re-run `bun run check` sequentially.

---

## Docs To Read First (for any new work)

1. `docs/implementation-handbook.md` (source of truth)
2. `docs/spec-tui-style.md`
3. `docs/spec-api-polling.md`
4. `docs/spec-custom-providers.md`
5. `docs/perf-budget.md`
6. `docs/review-prompt.md`
7. `docs/plans/2026-02-26-unified-execution-approach.md` (refactor direction)

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
2. Read the handbook + three specs + refactor plan.
3. Confirm current TODO scope:
   - standalone polling integration,
   - unified core refactor,
   - version metadata cleanup.
4. Keep behavior-compatible changes first; add tests before refactors.
5. Re-run `bun run check` before any completion claim.
