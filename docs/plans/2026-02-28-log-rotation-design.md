# Design: Self-Rotating Debug Log System

**Date:** 2026-02-28
**Status:** Approved

## Context

The logger (`src/services/logger.ts`) appends to a single `debug.log` file indefinitely when debug mode is active (`DEBUG=1` or `CC_STATUSLINE_DEBUG=1`). Over time this file grows unbounded. The process is short-lived — spawned fresh on every statusline tick (~30 log lines per invocation, ~3 KB), then exits.

## Requirements

- Debug mode only — zero cost when disabled
- Minimal performance impact even in debug mode
- Two rotation triggers: file size AND file age
- Two-tier archive: recent archives stay as `.log`, older archives compressed to `.log.gz`
- Cleanup: delete archives older than 3 days

## Parameters

| Parameter | Value | Rationale |
|---|---|---|
| Check probability | 1/20 invocations | Amortizes stat() cost across invocations |
| Size threshold | 500 KB (~167 runs) | Small archives, frequent rotation |
| Time threshold | 24 hours | Daily boundaries; keeps recent logs readable |
| Archive retention | 3 days | Aggressive cleanup; disk stays minimal |

## Architecture

```
src/services/log-rotator.ts               ← new: pure rotation logic
src/services/logger.ts                    ← modified: call maybeRotateLogs() in constructor
src/services/__tests__/log-rotator.test.ts ← new: unit tests
```

No other files change.

## File Layout

```
~/.claude/cc-api-statusline/
  debug.log                          ← active log (written to)
  debug.2026-01-28T14-30.log        ← size-rotated today, plain text, readable
  debug.2026-01-28T09-00.log        ← size-rotated today, plain text, readable
  debug.2026-01-27T06-00.log.gz     ← age >24h, compressed by cleanup pass
  debug.2026-01-25T00-00.log.gz     ← will be deleted (>3 days old)
```

## Rotation Logic — `maybeRotateLogs(logPath: string): void`

```
1. Probabilistic gate
   if Math.random() > 0.05 → return immediately (19/20 invocations, zero I/O)

2. Stat active log
   stat(debug.log) → if missing, return

3. Rotation check (active log)
   size ≥ 500 KB AND age < 24h:
     renameSync(debug.log → debug.YYYY-MM-DDTHH-MM.log)
     // plain .log, no gzip — still within today

   age ≥ 24h:
     renameSync(debug.log → debug.YYYY-MM-DDTHH-MM.log)
     spawn('gzip', ['-f', archive], { detached: true, stdio: 'ignore' }).unref()
     // compress immediately; file is "old" already

4. Cleanup pass (runs on every 1/20 invocation that passes the gate)
   readdirSync(logDir):
     For each debug.*.log (not .gz) where mtime > 24h:
       spawn('gzip', ['-f', file], { detached: true }).unref()
     For each debug.*.log.gz where mtime > 3 days:
       unlinkSync(file)
```

### Archive naming

`debug.YYYY-MM-DDTHH-MM.log` — ISO date + hour-minute (no seconds) avoids name collisions within the same minute (each run is ~3 KB; rotating at 500 KB means ~167 runs between rotations, far more than one per minute).

## Logger Integration

One line added to `Logger` constructor, after `ensureLogDir()`:

```typescript
if (this.enabled) {
  this.ensureLogDir();
  maybeRotateLogs(this.logPath);  // ← added
}
```

## Performance Profile

| Scenario | Overhead |
|---|---|
| 19/20 invocations | ~0 µs (single Math.random() call) |
| 1/20, no rotation needed | ~0.2 ms (one statSync) |
| 1/20, cleanup only (gzip old .log) | ~0.5 ms (readdir + spawn detached) |
| 1/20, rotation + cleanup | ~1.5–2 ms (rename + spawn + readdir + unlink) |

All disk-heavy work (gzip compression) runs in a detached child process that outlives the parent. The parent process exits immediately after printing the statusline — no blocking.

## Testing Strategy

File: `src/services/__tests__/log-rotator.test.ts`

All tests mock `fs` (statSync, renameSync, readdirSync, unlinkSync) and `child_process.spawn` — no real disk I/O.

| # | Scenario | Expected |
|---|---|---|
| 1 | Random roll misses (Math.random = 0.99) | No statSync called |
| 2 | File does not exist | Graceful no-op |
| 3 | File < 500 KB, age < 24h | No rotation, no gzip |
| 4 | File ≥ 500 KB, age < 24h | renameSync to `.log`, no gzip spawn |
| 5 | File age ≥ 24h (any size) | renameSync to `.log`, gzip spawned detached |
| 6 | Cleanup: `.log` archive with mtime > 24h | gzip spawned for that archive |
| 7 | Cleanup: `.log.gz` archive with mtime > 3 days | unlinkSync called |
| 8 | Cleanup: fresh archives | No action taken |
