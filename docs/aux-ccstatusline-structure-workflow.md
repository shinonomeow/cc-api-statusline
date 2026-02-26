# ccstatusline Structure & Dev Workflow Audit (Aux)

Reference audit source: `/Users/liafo/Development/GitWorkspace/ccstatusline`.
Scope: codebase structure and development workflow patterns only (not runtime compatibility contract).

---

## 1. Fresh Audit Snapshot

### 1.1 Structure pattern (verified)

- Single entrypoint orchestration in `src/ccstatusline.ts` with mode split (piped vs TUI).
- Clear domain folders:
  - `src/types/` for schemas/types (Zod + inferred TS types).
  - `src/utils/` for cross-cutting runtime logic.
  - `src/widgets/` for feature modules behind a registry.
  - `src/tui/` for interactive config UI only.
- Co-located tests under `src/**/__tests__/` (16 test files currently).
- Small operational scripts in `scripts/` (`payload.example.json`, `replace-version.ts`).

### 1.2 Workflow pattern (verified)

- `package.json` scripts establish a compact local loop:
  - `start`, `example`, `test`, `lint`, `build`, `postbuild`.
- Build is deterministic and bundled:
  - `bun build src/ccstatusline.ts --target=node --outfile=dist/ccstatusline.js --target-version=14`.
- Lint gate is combined:
  - Typecheck + eslint in one command (`bun tsc --noEmit; eslint ...`).
- Documentation generation exists (`typedoc`) and is script-driven.

### 1.3 Implementation hygiene patterns worth copying

- Config versioning + migration pipeline (`CURRENT_VERSION`, `needsMigration`, `migrateConfig`).
- Bad-config safety path:
  - parse failure -> backup file -> regenerate defaults.
- Registry-first extensibility:
  - one central map for widget providers (`utils/widgets.ts`).
- Runtime fixture workflow:
  - sample payload committed for fast local smoke tests.

---

## 2. What We Should Adopt for `cc-api-statusline`

### 2.1 Adopt now (v1 scaffold)

1. Keep one primary entrypoint (`src/main.ts`) with explicit mode branching (`--once` piped fast-path, optional daemon/loop mode).
2. Use strict domain split from day one:
   - `src/types/` (`NormalizedUsage`, config, cache schemas)
   - `src/providers/` (sub2api, relay, custom mapping)
   - `src/services/` (polling, cache, config, autodetect)
   - `src/render/` (style + layout + truncation)
   - `src/main.ts` (orchestration only)
3. Use a registry pattern for providers (`providerId -> adapter`) to avoid switch-sprawl.
4. Keep co-located tests:
   - `src/providers/__tests__`, `src/services/__tests__`, `src/render/__tests__`.
5. Keep script-driven smoke tests with committed fixtures (already started via `scripts/piped-example.{sh,ps1}`).
6. Define a single local quality gate command sequence:
   - `bun test` -> `bun run lint` -> `bun run build`.

### 2.2 Adopt soon (post-scaffold)

1. Config schema versioning and migrations before first public config release.
2. Post-build metadata replacement only if runtime needs embedded version string.
3. Optional typed API docs generation (Typedoc) after core APIs stabilize.

### 2.3 Do not copy directly

1. Full TUI app structure from ccstatusline (`src/tui/**`) should stay out of v1 critical path.
2. Heavy UI-focused lint/style strictness can be deferred until core poll/render path is stable.
3. Node 14 build target is not automatically suitable for this repo; choose target based on actual Claude Code host runtime requirement in handbook/perf constraints.

---

## 3. Concrete Files To Add So Agents Can Start Faster

Based on the ccstatusline workflow shape and our current docs-only state, add these minimal scaffolding files before implementation planning execution:

1. `package.json`
   - Scripts: `dev`, `once`, `test`, `lint`, `build`, `check` (test+lint+build).
2. `tsconfig.json`
   - strict mode and bundler-oriented resolution.
3. `vitest.config.ts`
   - baseline test runner config.
4. `eslint.config.js`
   - baseline TS rules (can start lean, then harden).
5. `src/main.ts`
   - mode/orchestration skeleton only.
6. `src/types/normalized-usage.ts`
   - canonical usage schema + helper guards.
7. `src/providers/index.ts`
   - adapter registry skeleton.
8. `src/services/cache.ts`
   - read/write stub with atomic write contract.
9. `src/render/index.ts`
   - render function signature and placeholder implementation.
10. `src/**/__tests__/` seeds
   - one smoke test per domain to enforce shape early.

---

## 4. Suggested Dev Workflow For This Repo

Use this as the day-1 contributor loop:

1. `bun install`
2. `bun run once` (fixture-driven piped smoke test)
3. `bun test`
4. `bun run lint`
5. `bun run build`

Definition of done per phase:

1. All tests green.
2. Lint/typecheck green.
3. Build succeeds.
4. `--once` smoke script returns a single-line output within perf budget.

---

## 5. Planning Inputs (with this audit)

For implementation planning, use together:

1. `docs/implementation-handbook.md`
2. `docs/aux-scaffold-phased-plan.md`
3. `docs/ccstatusline-contract-reference.md`
4. `docs/perf-budget.md`
5. `docs/aux-ccstatusline-structure-workflow.md` (this file)

---

## 6. Audit Evidence Files

Key `ccstatusline` files inspected for this audit:

1. `package.json`
2. `src/ccstatusline.ts`
3. `src/utils/config.ts`
4. `src/utils/migrations.ts`
5. `src/utils/widgets.ts`
6. `src/types/Settings.ts`
7. `src/types/StatusJSON.ts`
8. `eslint.config.js`
9. `tsconfig.json`
10. `vitest.config.ts`
11. `scripts/payload.example.json`
12. `scripts/replace-version.ts`
