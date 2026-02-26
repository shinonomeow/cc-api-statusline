# Scaffold-First & Phased Development Plan (Aux)

> Companion guidance for `implementation-handbook.md`. Use this before writing production code.

---

## 1. Purpose

This aux guide defines:

- how to scaffold the repo before feature implementation
- how to execute development in strict, testable phases
- what "done" means at each phase boundary

It is intentionally procedural so implementation can start with low ambiguity.

---

## 2. Scaffold Before Implementation

Do scaffolding first. Do not implement provider logic or rendering until scaffold checks pass.

### 2.1 Scaffold goals

1. Establish build, test, and lint tooling
2. Create stable source layout matching handbook modules
3. Make a no-op CLI executable that runs in piped and TTY modes
4. Ensure CI-style checks can run locally

### 2.2 Minimum scaffold artifacts

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `eslint.config.js`
- `.gitignore`
- `src/main.ts`
- `src/types.ts`
- `src/config.ts`
- `src/providers/`
- `src/renderer/`
- `src/cache.ts`
- `src/polling.ts`
- `test/` (or `src/**/*.test.ts`)

### 2.3 Scaffold smoke checks

Run and verify:

```bash
bun run build
bun test
bun run lint
```

Expected at scaffold stage:

- build succeeds
- test runner executes (even if only baseline tests exist)
- lint runs without config errors

---

## 3. Phase-Based Execution Model

Use the same phase numbering as handbook §10 to avoid drift.

## Phase 1 — Foundation

Deliver:

- runtime mode detection in `main.ts`
- config load/merge/defaults in `config.ts`
- core interfaces in `types.ts`
- baseline tests for config defaults and validation

Exit criteria:

- `bun test` passes for foundation tests
- `main.ts --help` and `--version` stubs work
- missing env var error path renders expected message

## Phase 2 — Provider Layer

Deliver:

- built-in adapters: sub2api + claude-relay-service
- autodetect with cache
- custom provider loader/mapping
- adapter unit tests with mocked responses

Exit criteria:

- each adapter produces valid `NormalizedUsage`
- edge cases covered (`null`, missing blocks, `0`, `-1`)
- autodetect tests pass for override and fallback paths

## Phase 3 — Cache & Polling

Deliver:

- atomic cache read/write and validation
- per-baseUrl cache keying
- polling loop with backoff and pause rules
- `tokenHash` and `errorState` fields in cache schema
- env change detection via `~/.claude/settings.json` at top of each poll cycle

Exit criteria:

- cache freshness/invalidity tests pass
- polling state transitions are deterministic under test
- auth failures (`401/403`) enter `AUTH_ERROR_HALTED` state as specified
- `AUTH_ERROR_HALTED` → `RECOVERY_FETCH` transition triggers when token changes in settings.json
- env change detection triggers immediate re-fetch (skips poll interval wait)
- `tokenHash` mismatch in cache correctly forces a fresh fetch in piped mode

## Phase 4 — Renderer

Deliver:

- component composition pipeline
- bar styles, countdown, color resolution, truncation
- error rendering states
- transition state indicator (`⟳`) rendering

Exit criteria:

- snapshot tests for representative layouts/modes
- ANSI-aware truncation tests pass
- null-tolerant rendering behavior verified
- transition indicator renders correctly: dim styling, correct messages for provider-switch / token-change / new-endpoint triggers
- auth error recovery display shows `⚠ Auth error ⟳ Waiting for new credentials...`

## Phase 5 — CLI Integration

Deliver:

- end-to-end wiring: fetch -> normalize -> cache -> render -> stdout
- piped mode compatibility (`stdin` accepted, ignored for business logic)
- flags: `--help`, `--version`, `--once`, `--config`

Exit criteria:

- command returns within timeout budget in piped mode with warm cache
- non-zero exits map to documented error behaviors
- standalone mode detects env changes via `~/.claude/settings.json` and emits transition indicator
- startup reads `process.env` overlaid with `~/.claude/settings.json` env field correctly
- `--once` flag produces a fresh fetch and exits (useful after manual provider switch)

## Phase 6 — Polish

Deliver:

- E2E tests
- README examples and setup docs
- npm publish-ready package metadata

Exit criteria:

- full test suite green
- documented commands match real CLI behavior
- build artifact runnable via `bunx` and local `bun run`

---

## 4. Working Rules Per Phase

1. Write/adjust tests before implementation changes for the phase.
2. Keep commits small and phase-scoped.
3. Do not start next phase with failing tests in current phase.
4. Re-run smoke checks (`build`, `test`, `lint`) at each phase boundary.
5. Capture deviations in docs immediately; do not leave hidden assumptions.

---

## 5. Recommended Commit Strategy

- One commit for scaffold baseline
- One or more commits per phase with passing tests
- Optional checkpoint tag after each completed phase

Commit message pattern:

`feat(phase-N): <short description>`

Examples:

- `feat(phase-1): add config loader and defaults`
- `feat(phase-2): implement relay adapter mapping`

---

## 6. Local Debug Inputs (Real Providers)

When testing real endpoints/keys, store credentials in:

`/Users/liafo/Development/GitWorkspace/cc-api-statusline/.agent/debug.env`

Reference detailed commands in handbook §11 "Testing & Debugging (Local Provider Credentials)".

