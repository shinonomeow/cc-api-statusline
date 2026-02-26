# Performance Budget & Responsiveness Gate

> Runtime budget targets for `cc-api-statusline`, focused on ccstatusline custom-command execution.

---

## 1. Primary Budget

- Host default timeout: **1000 ms** (ccstatusline custom-command default).
- Planning target: return output within **<= 900 ms**.
- Safety margin: **>= 50 ms**.

---

## 2. Piped-Mode Budget Allocation (Target)

Warm cache, rendered line valid:

- startup + arg/env read: <= 5 ms
- cache file read/parse: <= 10 ms
- config hash check (raw bytes hash): <= 5 ms
- output write + exit: <= 5 ms
- total target: <= 25 ms

Warm cache, rendered line stale but data valid:

- startup + env: <= 5 ms
- cache read/parse: <= 10 ms
- config load/merge: <= 15 ms
- re-render from cached normalized data: <= 15 ms
- output + cache update fire-and-forget: <= 10 ms
- total target: <= 55 ms

Cold/stale cache (network path):

- only attempt fetch if remaining budget exceeds request timeout budget
- otherwise return fallback (`[loading...]` or stale output) within deadline

---

## 3. Hard Rules

1. Never start network fetch when remaining budget < request timeout window.
2. Prefer stale cached output over timeout.
3. Avoid full config parse/validation in fast path when rendered cache is usable.
4. Use per-baseUrl cache files to avoid cross-terminal cache contention.

---

## 4. Measurement Checklist

Run each scenario at least 10 times and record p50/p95:

1. piped mode, warm rendered cache
2. piped mode, warm data cache with forced re-render
3. piped mode, cold cache + unavailable network
4. standalone single fetch (`--once`) with valid network

Record:

- wall clock duration
- path taken (rendered cache, data cache re-render, network, fallback)
- whether deadline was met

---

## 5. Release Gate

Before starting implementation phase handoff:

- p95 of warm rendered-cache path <= 100 ms
- no timeout in piped-mode tests under default 1000 ms host budget
- fallback path returns deterministic output under offline/error scenarios

