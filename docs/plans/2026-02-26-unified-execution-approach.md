# Unified Execution Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify piped and standalone execution on one shared core pipeline, with mode-specific policy wrappers only.

**Architecture:** Build a shared `executeCycle` core that handles env/config/cache/provider/render/cache-write decisions once. Keep only scheduling/deadline behavior in mode policies (`piped`, `standalone`). Reduce `main.ts` to CLI parsing and orchestration.

**Tech Stack:** TypeScript, Bun runtime, Vitest, ESLint, existing provider/cache/renderer services.

---

## Scope and Non-Goals

### In scope
- Single shared execution path for both modes.
- Mode policy abstraction for deadline vs loop scheduling.
- Standalone mode wired through the same core (remove "not yet implemented" branch).
- Regression-safe refactor with tests first.

### Out of scope
- New UI features/components.
- New provider adapters.
- Benchmark harness overhaul (only targeted perf checks for critical paths).

---

## Phase 1: Freeze Existing Behavior With Characterization Tests

### Task 1.1: Strengthen piped behavior tests
**Files:**
- Modify: `src/__tests__/main.test.ts`

**Steps:**
1. Add/confirm tests for piped warm cache, stale-cache rerender, fetch path, fallback path.
2. Assert output/exit-code semantics for success/failure cases.
3. Run: `bun test src/__tests__/main.test.ts`

### Task 1.2: Strengthen polling behavior tests
**Files:**
- Modify: `src/services/__tests__/polling.test.ts`

**Steps:**
1. Add/confirm state transition coverage (`POLLING`, `AUTH_ERROR_HALTED`, `RECOVERY_FETCH`).
2. Add coverage for env change handling and provider invalidation callbacks.
3. Run: `bun test src/services/__tests__/polling.test.ts`

---

## Phase 2: Introduce Unified Core Execution API

### Task 2.1: Define core contracts
**Files:**
- Create: `src/core/types.ts`

**Steps:**
1. Define `ExecutionContext` (env/config/cache/provider/deadline hints).
2. Define `ExecutionResult` (renderedLine, nextAction, exitCode, cacheUpdate, errorState).
3. Keep types runtime-agnostic and free of CLI concerns.

### Task 2.2: Implement core cycle
**Files:**
- Create: `src/core/execute-cycle.ts`

**Steps:**
1. Implement single-cycle flow:
   - validate env
   - read/evaluate cache
   - optional fetch
   - render output
   - prepare cache write payload
2. Ensure no direct `process.*` calls in core.
3. Add tests: `src/core/__tests__/execute-cycle.test.ts`.
4. Run: `bun test src/core/__tests__/execute-cycle.test.ts`

---

## Phase 3: Add Mode Policy Layer

### Task 3.1: Define policy interface
**Files:**
- Create: `src/core/mode-policy.ts`

**Steps:**
1. Define `ModePolicy` contract:
   - budget/deadline derivation
   - retry/scheduling decisions
   - fallback behavior
2. Keep policy pure and testable.

### Task 3.2: Implement piped policy
**Files:**
- Create: `src/core/policies/piped.ts`

**Steps:**
1. Encode current piped constraints:
   - strict timeout budget
   - one-shot semantics
   - stale cache fallback preference
2. Add tests: `src/core/__tests__/piped-policy.test.ts`.

### Task 3.3: Implement standalone policy
**Files:**
- Create: `src/core/policies/standalone.ts`

**Steps:**
1. Encode loop/backoff intents for long-running mode.
2. Integrate with existing polling state machine semantics.
3. Add tests: `src/core/__tests__/standalone-policy.test.ts`.

---

## Phase 4: Refactor Entry Point to Thin Orchestrator

### Task 4.1: Refactor `main.ts`
**Files:**
- Modify: `src/main.ts`

**Steps:**
1. Keep only:
   - CLI arg parsing
   - mode detection
   - dependency assembly
   - output/exit side effects
2. Route logic through `executeCycle + ModePolicy`.
3. Remove duplicated mode branches in business logic.
4. Preserve current CLI output/help/version behavior.

### Task 4.2: Preserve fire-and-forget cache writes
**Files:**
- Modify: `src/main.ts`
- Modify (if needed): `src/services/cache.ts`

**Steps:**
1. Keep non-blocking cache-write behavior in piped mode.
2. Ensure write failures never block stdout path.

---

## Phase 5: Wire Standalone Mode Through Shared Core

### Task 5.1: Integrate polling engine with core cycle
**Files:**
- Modify: `src/services/polling.ts`
- Modify: `src/main.ts`

**Steps:**
1. Use `PollingEngine` as scheduler/state driver.
2. Execute shared `executeCycle` per poll tick.
3. Remove `Standalone polling mode not yet implemented` branches.
4. Add integration tests for standalone run loop entry/exit behavior.

---

## Phase 6: Unify Error/Exit Policy

### Task 6.1: Centralize error mapping
**Files:**
- Create: `src/core/error-policy.ts`
- Modify: `src/main.ts`
- Reuse: `src/renderer/error.ts`

**Steps:**
1. Map core/provider/cache errors into consistent render + exit behavior.
2. Ensure piped vs standalone differences are policy-driven, not ad-hoc.
3. Add tests for non-zero exits and fallback rendering.

---

## Phase 7: Verification and Documentation

### Task 7.1: Full verification
**Files:**
- N/A (validation commands)

**Steps:**
1. Run: `bun test`
2. Run: `bun run lint`
3. Run: `bun run build`
4. Confirm no regression in piped path timing targets.

### Task 7.2: Update docs
**Files:**
- Modify: `README.md`
- Modify: `docs/implementation-handbook.md`
- Modify (if needed): `docs/spec-api-polling.md`

**Steps:**
1. Document unified architecture and policy split.
2. Clarify standalone support status and behavior.
3. Keep timeout/piped constraints explicit for ccstatusline context.

---

## Acceptance Criteria

1. One shared execution core for both modes.
2. `main.ts` acts as orchestrator only.
3. No duplicated piped/standalone business logic.
4. Standalone mode runs via shared pipeline (no TODO placeholder branch).
5. `bun test && bun run lint && bun run build` all pass.
6. Existing piped performance characteristics remain within budget.

---

## Suggested Commit Sequence

1. `test: add characterization coverage for piped and polling behavior`
2. `refactor: introduce core execution contracts and executeCycle`
3. `feat: add piped and standalone mode policies`
4. `refactor: route main through unified core`
5. `feat: wire standalone loop through shared executeCycle`
6. `refactor: centralize error and exit policy`
7. `docs: document unified architecture and runtime behavior`
