# Final Gate Review Prompt - Current Repo Readiness for Refactor/Feature Planning

Use this as a strict quality gate before drafting any new implementation/refactor plan.

---

You are the **final gate reviewer** for `cc-api-statusline` documentation and implementation alignment.

Your task is to decide whether docs and code are consistent, complete, and safe enough to start a new implementation/refactor plan.

## Scope and hard rules

- This is a **gate review only**.
- Do **not** generate a new implementation plan.
- Verify claims against source files; do not assume docs are correct.
- End with a strict decision: `PASS` or `BLOCKED`.
- `PASS` requires zero blockers.

## Files to read (in order)

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/current-implementation.md`
4. `docs/ccstatusline-contract-reference.md`
5. `docs/perf-budget.md`
6. `src/main.ts`
7. `src/core/execute-cycle.ts`
8. `src/services/cache.ts`
9. `src/services/config.ts`
10. `src/services/env.ts`
11. `src/providers/index.ts`
12. `src/renderer/index.ts`

Legacy reference (optional, deprecated):

- `docs/implementation-handbook.md`
- `docs/spec-api-polling.md`
- `docs/spec-tui-style.md`
- `docs/spec-custom-providers.md`

If legacy docs conflict with current docs or code, treat legacy content as outdated.

## External references to verify against

| Source | Path | Why |
|---|---|---|
| ccstatusline widget | `/Users/liafo/Development/GitWorkspace/ccstatusline/src/widgets/CustomCommand.tsx` | Validate stdin/stdout/timeout/ANSI behavior assumptions |
| ccstatusline config utils | `/Users/liafo/Development/GitWorkspace/ccstatusline/src/utils/config.ts` | Validate Claude settings path conventions |
| sub2api endpoint | `/Users/liafo/Development/GitWorkspace/sub2api/Usage_Endpoint.md` | Validate adapter field mapping completeness |
| relay-service endpoint | `/Users/liafo/Development/GitWorkspace/claude-relay-service/docs/api-user-stats-endpoint.md` | Validate adapter field mapping completeness |

## Gate criteria (all must pass)

### 1) Docs and code alignment

- `docs/current-implementation.md` matches current `src/` behavior.
- `AGENTS.md` commands, architecture map, and known gaps are accurate.
- Deprecated docs are clearly marked and not described as source of truth.
- Poll interval default is consistently documented as **30s**.

### 2) Execution model correctness

- Unified single-cycle model (Path A/B/C/D) is clearly documented and matches `executeCycle`.
- Piped mode and `--once` mode behavior are unambiguous.
- No doc claims require a background standalone poll loop unless explicitly marked as future work.

### 3) Responsiveness and performance

- Piped mode design remains compatible with host timeout defaults (1000ms).
- Fast cache path avoids unnecessary work.
- Deadline/fallback behavior is explicitly documented and source-backed.
- Perf budget docs are realistic and measurable.

### 4) Operational safety

- Token handling rules are explicit (no token persistence/logging).
- Cache/config paths and overlay precedence are accurately documented.
- Error fallback behavior is documented for missing env, network failure, and stale cache conditions.

### 5) Plan readiness

- A new agent can start feature/refactor planning from docs without hidden assumptions.
- Open gaps are explicitly listed and prioritized.

## Required checks

- Cross-check docs against source files listed above.
- Confirm stale references to removed files are gone.
- Confirm deprecated docs are not presented as authoritative.
- Flag any mismatch that could cause incorrect planning or runtime regressions.

## Output format (required)

### Gate Decision

- `PASS` or `BLOCKED`
- One-sentence rationale

### Verified

- Brief bullet list of source-verified truths

### Blockers

- Numbered list
- Include file path + line references
- Quote conflicting text
- Provide exact fix direction

### High-Risk Non-Blockers

- Numbered list of serious but non-blocking gaps

### Performance Verdict

- Explicit yes/no on piped-mode timeout readiness
- Short critical-path summary

### Accuracy Verdict

- Explicit yes/no on provider mapping + normalized schema completeness
- Note unresolved edge-case behavior (`null`, `0`, `-1`, missing fields)

### Ready-to-Plan Checklist

- `[x]` / `[ ]` list:
  - Current docs aligned to code
  - Polling default consistently 30s
  - Unified execution model clearly documented
  - Performance path clear and testable
  - Provider mappings complete
  - Security/debug guidance adequate
  - No stale references to removed docs files

If any checklist item is unchecked, final decision must be `BLOCKED`.
