# Log Rotation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a self-rotating debug log system to `logger.ts` that prevents `debug.log` from growing unbounded, active only in debug mode, with minimal performance impact.

**Architecture:** A new `log-rotator.ts` service holds all rotation logic. On 1 in 20 invocations (probabilistic gate), it stats the active log and rotates if size ≥ 500 KB or age ≥ 24h. Recent rotated files stay as `.log`; archives older than 24h are gzipped by a detached child process; archives older than 3 days are deleted. Logger constructor calls `maybeRotateLogs()` with one added line.

**Tech Stack:** Node.js `fs` (statSync, renameSync, readdirSync, unlinkSync), `child_process.spawn` (detached gzip), vitest for tests, `utimesSync` to simulate file ages in tests.

---

### Task 1: Create `log-rotator.ts` with constants and archive name helper

**Files:**
- Create: `src/services/log-rotator.ts`
- Test: `src/services/__tests__/log-rotator.test.ts`

**Step 1: Write the failing test**

Create `src/services/__tests__/log-rotator.test.ts`:

```typescript
/**
 * Tests for log rotation service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock child_process.spawn for all tests — we verify args, not real gzip
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { archiveName, maybeRotateLogs } from '../log-rotator.js';

describe('archiveName', () => {
  it('formats archive path with date and hour-minute', () => {
    const logPath = '/tmp/test/debug.log';
    const now = new Date('2026-01-28T14:30:00.000Z');
    // Use local time equivalent for test — just verify format
    const result = archiveName(logPath, now);
    expect(result).toMatch(/^\/tmp\/test\/debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/);
  });

  it('places archive in the same directory as the log', () => {
    const logPath = '/some/dir/debug.log';
    const result = archiveName(logPath, new Date());
    expect(result).toMatch(/^\/some\/dir\/debug\./);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: FAIL — `archiveName` not found (module doesn't exist).

**Step 3: Create minimal `src/services/log-rotator.ts`**

```typescript
/**
 * Log rotation service
 *
 * Rotates debug.log when size >= 500 KB or age >= 24h.
 * Only active in debug mode. Probabilistic check: 1 in 20 invocations.
 *
 * Archive tiers:
 *   - Recent (<24h): debug.YYYY-MM-DDTHH-MM.log  (plain text)
 *   - Old (>24h):    debug.YYYY-MM-DDTHH-MM.log.gz (gzip via detached child)
 *   - Expired (>3d): deleted
 */

import { statSync, renameSync, readdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join } from 'path';

const ROTATION_PROBABILITY = 0.05;              // 1/20 invocations
const MAX_SIZE_BYTES = 512 * 1024;              // 500 KB
const MAX_AGE_MS = 24 * 60 * 60 * 1000;        // 24 hours
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Build archive filename from logPath and a timestamp.
 * Format: debug.YYYY-MM-DDTHH-MM.log (in same directory as logPath)
 */
export function archiveName(logPath: string, now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  return join(dirname(logPath), `debug.${y}-${mo}-${d}T${h}-${min}.log`);
}

export function maybeRotateLogs(_logPath: string): void {
  // placeholder — implemented in later tasks
}
```

**Step 4: Run test to verify it passes**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: PASS (archiveName tests).

**Step 5: Commit**

```bash
git add src/services/log-rotator.ts src/services/__tests__/log-rotator.test.ts
git commit -m "feat: add log-rotator skeleton with archiveName helper"
```

---

### Task 2: Implement probabilistic gate + stat (no rotation yet)

**Files:**
- Modify: `src/services/log-rotator.ts`
- Modify: `src/services/__tests__/log-rotator.test.ts`

**Step 1: Add tests for gate and missing-file no-op**

Append to the `describe` block in `log-rotator.test.ts`:

```typescript
import { spawn } from 'child_process';

describe('maybeRotateLogs', () => {
  let testDir: string;
  let logPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'log-rotator-test-'));
    logPath = join(testDir, 'debug.log');
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('does nothing when random roll misses the gate', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // > 0.05 → gate blocks
    maybeRotateLogs(logPath);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does nothing when log file does not exist', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // passes gate
    // logPath does not exist — no error, no spawn
    expect(() => maybeRotateLogs(logPath)).not.toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: FAIL — `maybeRotateLogs` is a no-op, gate test will pass by accident but missing-file test may expose the real stub.

**Step 3: Implement gate + stat in `maybeRotateLogs`**

Replace the `maybeRotateLogs` stub in `log-rotator.ts`:

```typescript
export function maybeRotateLogs(logPath: string): void {
  if (Math.random() > ROTATION_PROBABILITY) return;

  const logDir = dirname(logPath);
  const stat = statSync(logPath, { throwIfNoEntry: false });

  if (stat) {
    // Rotation logic — implemented next task
  }

  runCleanup(logDir);
}

function runCleanup(_logDir: string): void {
  // Cleanup logic — implemented in Task 4
}
```

**Step 4: Run test to verify it passes**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/log-rotator.ts src/services/__tests__/log-rotator.test.ts
git commit -m "feat: add maybeRotateLogs probabilistic gate and stat"
```

---

### Task 3: Implement size-based rotation (age < 24h, rename only, no gzip)

**Files:**
- Modify: `src/services/log-rotator.ts`
- Modify: `src/services/__tests__/log-rotator.test.ts`

**Step 1: Add tests**

Add to the `maybeRotateLogs` describe block:

```typescript
import { writeFileSync, utimesSync, readdirSync } from 'fs';

// Helper: create log file with given size and age
function createLog(path: string, sizeBytes: number, ageMs: number): void {
  writeFileSync(path, 'x'.repeat(sizeBytes));
  const mtime = (Date.now() - ageMs) / 1000;
  utimesSync(path, mtime, mtime);
}

it('does NOT rotate when file is small and recent', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  createLog(logPath, 100, 1000); // 100 bytes, 1s old
  maybeRotateLogs(logPath);
  // debug.log still exists, no archives created
  expect(existsSync(logPath)).toBe(true);
  const archives = readdirSync(testDir).filter(f => f.startsWith('debug.') && f !== 'debug.log');
  expect(archives).toHaveLength(0);
});

it('renames to .log archive (no gzip) when size >= 500 KB and age < 24h', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  createLog(logPath, 512 * 1024, 1000); // 500 KB, 1s old — size trigger
  maybeRotateLogs(logPath);
  // Original log gone, one .log archive created
  expect(existsSync(logPath)).toBe(false);
  const archives = readdirSync(testDir).filter(f => /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/.test(f));
  expect(archives).toHaveLength(1);
  // gzip was NOT called
  expect(spawn).not.toHaveBeenCalledWith('gzip', expect.anything(), expect.anything());
});
```

**Step 2: Run test to verify it fails**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: FAIL — size-based rotation not implemented.

**Step 3: Implement size-based rotation branch**

Inside the `if (stat)` block in `maybeRotateLogs`:

```typescript
const age = Date.now() - stat.mtimeMs;
const archive = archiveName(logPath);

try {
  if (age >= MAX_AGE_MS) {
    // Old: rename + gzip (implemented next task)
    renameSync(logPath, archive);
    spawnGzip(archive);
  } else if (stat.size >= MAX_SIZE_BYTES) {
    // Large but recent: rename only, stays readable as .log
    renameSync(logPath, archive);
  }
} catch {
  // Silent failure — never break statusline execution
}
```

Add the `spawnGzip` helper (stub for now):

```typescript
function spawnGzip(filePath: string): void {
  try {
    const child = spawn('gzip', ['-f', filePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Silent failure — gzip not available
  }
}
```

**Step 4: Run test to verify it passes**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/log-rotator.ts src/services/__tests__/log-rotator.test.ts
git commit -m "feat: implement size-based log rotation (rename to .log, no gzip)"
```

---

### Task 4: Implement age-based rotation (≥ 24h → rename + gzip detached)

**Files:**
- Modify: `src/services/__tests__/log-rotator.test.ts`

Note: `log-rotator.ts` already has the age branch from Task 3. This task adds the tests to verify `spawn('gzip', ...)` is called correctly.

**Step 1: Add test**

```typescript
it('renames and spawns gzip when file age >= 24h', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  const twentyFiveHoursMs = 25 * 60 * 60 * 1000;
  createLog(logPath, 1000, twentyFiveHoursMs); // small but old
  maybeRotateLogs(logPath);
  // Original log gone
  expect(existsSync(logPath)).toBe(false);
  // gzip was called with the archive path
  expect(spawn).toHaveBeenCalledWith(
    'gzip',
    expect.arrayContaining(['-f']),
    expect.objectContaining({ detached: true })
  );
  // The gzip arg is the renamed archive, not the original debug.log
  const [, args] = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(args[1]).toMatch(/^.*debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/);
});
```

**Step 2: Run test to verify it fails**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: FAIL — spawn not called because age branch not wired (or the spawn mock assertion fails).

**Step 3: Verify implementation is correct**

The age branch in `log-rotator.ts` should already call `spawnGzip(archive)`. Re-read `maybeRotateLogs` to confirm the `if (age >= MAX_AGE_MS)` branch calls `renameSync` then `spawnGzip`. If it does, the test failure is in the mock assertion — adjust the spawn mock call inspection as needed.

**Step 4: Run test to verify it passes**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/__tests__/log-rotator.test.ts
git commit -m "test: verify age-based rotation spawns gzip detached"
```

---

### Task 5: Implement and test cleanup pass

**Files:**
- Modify: `src/services/log-rotator.ts` — implement `runCleanup`
- Modify: `src/services/__tests__/log-rotator.test.ts`

**Step 1: Add tests for cleanup**

```typescript
describe('cleanup pass', () => {
  let testDir: string;
  let logPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'log-rotator-cleanup-'));
    logPath = join(testDir, 'debug.log');
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // always pass gate
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function createArchive(name: string, ageMs: number): void {
    const filePath = join(testDir, name);
    writeFileSync(filePath, 'archive content');
    const mtime = (Date.now() - ageMs) / 1000;
    utimesSync(filePath, mtime, mtime);
  }

  it('spawns gzip for .log archives older than 24h', () => {
    const twentyFiveHoursMs = 25 * 60 * 60 * 1000;
    createArchive('debug.2026-01-27T06-00.log', twentyFiveHoursMs);
    maybeRotateLogs(logPath); // logPath doesn't exist, only cleanup runs
    expect(spawn).toHaveBeenCalledWith(
      'gzip',
      expect.arrayContaining(['debug.2026-01-27T06-00.log'.includes('-') ? expect.stringContaining('debug.2026-01-27T06-00.log') : '-f']),
      expect.objectContaining({ detached: true })
    );
  });

  it('deletes .log.gz archives older than 3 days', () => {
    const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
    createArchive('debug.2026-01-25T00-00.log.gz', fourDaysMs);
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'debug.2026-01-25T00-00.log.gz'))).toBe(false);
  });

  it('does NOT gzip .log archives younger than 24h', () => {
    createArchive('debug.2026-01-28T14-30.log', 1000); // 1s old
    maybeRotateLogs(logPath);
    // spawn not called for this file (only called if it were old)
    const gzipCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'gzip'
    );
    expect(gzipCalls).toHaveLength(0);
  });

  it('does NOT delete .log.gz archives younger than 3 days', () => {
    createArchive('debug.2026-01-27T06-00.log.gz', 1000); // 1s old
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'debug.2026-01-27T06-00.log.gz'))).toBe(true);
  });

  it('does not touch unrelated files', () => {
    createArchive('config.json', 10 * 24 * 60 * 60 * 1000); // 10 days old
    maybeRotateLogs(logPath);
    expect(existsSync(join(testDir, 'config.json'))).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: FAIL — `runCleanup` is a no-op stub.

**Step 3: Implement `runCleanup`**

Replace the stub in `log-rotator.ts`:

```typescript
const ARCHIVE_LOG_RE = /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log$/;
const ARCHIVE_GZ_RE = /^debug\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.log\.gz$/;

function runCleanup(logDir: string): void {
  try {
    const entries = readdirSync(logDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const { name } = entry;
      const filePath = join(logDir, name);

      if (ARCHIVE_LOG_RE.test(name)) {
        // Plain archive: gzip if older than 24h
        const s = statSync(filePath, { throwIfNoEntry: false });
        if (s && now - s.mtimeMs >= MAX_AGE_MS) {
          spawnGzip(filePath);
        }
        continue;
      }

      if (ARCHIVE_GZ_RE.test(name)) {
        // Compressed archive: delete if older than 3 days
        const s = statSync(filePath, { throwIfNoEntry: false });
        if (s && now - s.mtimeMs >= RETENTION_MS) {
          try { unlinkSync(filePath); } catch { /* silent */ }
        }
      }
    }
  } catch {
    // Silent failure — never break statusline execution
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
bun run build && npx vitest run src/services/__tests__/log-rotator.test.ts
```

Expected: PASS all tests.

**Step 5: Commit**

```bash
git add src/services/log-rotator.ts src/services/__tests__/log-rotator.test.ts
git commit -m "feat: implement log rotation cleanup pass (gzip old archives, delete expired)"
```

---

### Task 6: Wire `maybeRotateLogs` into Logger constructor

**Files:**
- Modify: `src/services/logger.ts:8,31-33`
- Verify: `src/services/__tests__/log-rotator.test.ts` full suite passes

**Step 1: Modify `logger.ts`**

Add the import at line 11 (after `ensureDir` import):

```typescript
import { maybeRotateLogs } from './log-rotator.js';
```

Modify the `if (this.enabled)` block (lines 31-33):

```typescript
// Before:
if (this.enabled) {
  this.ensureLogDir();
}

// After:
if (this.enabled) {
  this.ensureLogDir();
  maybeRotateLogs(this.logPath);
}
```

**Step 2: Run full test suite**

```bash
bun run test
```

Expected: All tests pass. No regressions in existing logger tests.

**Step 3: Verify rotation is debug-mode-only**

Check that `maybeRotateLogs` is inside the `if (this.enabled)` guard. If `this.enabled` is false (no `DEBUG` env var), `maybeRotateLogs` is never called — zero overhead in production mode.

**Step 4: Commit**

```bash
git add src/services/logger.ts
git commit -m "feat: wire log rotation into Logger constructor (debug mode only)"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

```bash
bun run test
```

Expected: All tests pass.

**Step 2: Manual smoke test in debug mode**

```bash
DEBUG=1 CC_API_STATUSLINE_LOG_DIR=/tmp/log-rotate-test bun run src/main.ts --once
ls -la /tmp/log-rotate-test/
```

Expected: `debug.log` created. No errors.

**Step 3: Verify rotation triggers (optional manual test)**

```bash
# Create a large fake log to trigger rotation
mkdir -p /tmp/log-rotate-test
dd if=/dev/urandom of=/tmp/log-rotate-test/debug.log bs=1k count=600

# Force the probabilistic gate by setting ROTATION_PROBABILITY to 1.0 temporarily,
# or just run many times:
for i in {1..30}; do
  DEBUG=1 CC_API_STATUSLINE_LOG_DIR=/tmp/log-rotate-test bun run src/main.ts --once 2>/dev/null
done
ls -la /tmp/log-rotate-test/
```

Expected: Within ~30 runs, a `debug.YYYY-MM-DDTHH-MM.log` archive appears and `debug.log` is smaller.

**Step 4: Commit if any fixups needed, then done.**
