# User-Agent Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable User-Agent spoofing to bypass sub2api restrictions that block non-Claude Code clients.

**Architecture:** Add `spoofClaudeCodeUA` config option (global + per-provider override) that accepts boolean or string. Auto-detect Claude Code version when `true`, use fallback `claude-cli/2.1.56 (external, cli)` if detection fails. Pass resolved UA to `secureFetch()` which adds it to request headers.

**Tech Stack:** TypeScript, Bun, Vitest, execSync for CLI detection

---

## Task 1: Update Config Types

**Files:**
- Modify: `src/types/config.ts:203-211`

**Step 1: Add spoofClaudeCodeUA to Config interface**

Add field to `Config` interface:

```typescript
export interface Config {
  display: DisplayConfig;
  components: ComponentsConfig;
  colors?: ColorsConfig;
  spoofClaudeCodeUA?: boolean | string;
  customProviders?: Record<string, CustomProviderConfig>;
  pollIntervalSeconds?: number;
  pipedRequestTimeoutMs?: number;
}
```

**Step 2: Add spoofClaudeCodeUA to CustomProviderConfig interface**

Add field to `CustomProviderConfig` interface (around line 187):

```typescript
export interface CustomProviderConfig {
  id: string;
  displayName?: string;
  endpoint: string;
  method: 'GET' | 'POST';
  contentType?: string;
  auth: CustomProviderAuthConfig;
  requestBody?: Record<string, unknown> | null;
  urlPatterns: string[];
  responseMapping: CustomProviderResponseMapping;
  spoofClaudeCodeUA?: boolean | string;
}
```

**Step 3: Verify TypeScript compiles**

Run: `bun run build`
Expected: Success (no TypeScript errors)

**Step 4: Commit**

```bash
git add src/types/config.ts
git commit -m "feat: add spoofClaudeCodeUA config types"
```

---

## Task 2: Create User-Agent Service (Tests)

**Files:**
- Create: `src/services/__tests__/user-agent.test.ts`

**Step 1: Write user-agent service tests**

Create test file:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUserAgent, detectClaudeVersion } from '../user-agent';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('resolveUserAgent', () => {
  it('returns null for false', () => {
    expect(resolveUserAgent(false)).toBe(null);
  });

  it('returns null for undefined', () => {
    expect(resolveUserAgent(undefined)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(resolveUserAgent('')).toBe(null);
  });

  it('returns custom UA string when provided', () => {
    expect(resolveUserAgent('custom-client/1.0')).toBe('custom-client/1.0');
  });

  it('returns fallback UA when true and detection fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });
    const result = resolveUserAgent(true);
    expect(result).toBe('claude-cli/2.1.56 (external, cli)');
  });

  it('returns detected UA when true and detection succeeds', () => {
    const originalEnv = process.env['CLAUDECODE'];
    process.env['CLAUDECODE'] = '1';

    vi.mocked(execSync).mockReturnValue('claude-cli/2.2.0\n' as any);

    const result = resolveUserAgent(true);
    expect(result).toBe('claude-cli/2.2.0 (external, cli)');

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });
});

describe('detectClaudeVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when CLAUDECODE env var not set', () => {
    const originalEnv = process.env['CLAUDECODE'];
    delete process.env['CLAUDECODE'];

    const result = detectClaudeVersion();
    expect(result).toBe(null);

    if (originalEnv !== undefined) {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });

  it('returns null when CLI execution fails', () => {
    const originalEnv = process.env['CLAUDECODE'];
    process.env['CLAUDECODE'] = '1';

    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command not found');
    });

    const result = detectClaudeVersion();
    expect(result).toBe(null);

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });

  it('parses version from CLI output with prefix', () => {
    const originalEnv = process.env['CLAUDECODE'];
    process.env['CLAUDECODE'] = '1';

    vi.mocked(execSync).mockReturnValue('claude-cli/2.1.56\n' as any);

    const result = detectClaudeVersion();
    expect(result).toBe('2.1.56');

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });

  it('parses version from CLI output without prefix', () => {
    const originalEnv = process.env['CLAUDECODE'];
    process.env['CLAUDECODE'] = '1';

    vi.mocked(execSync).mockReturnValue('2.1.56\n' as any);

    const result = detectClaudeVersion();
    expect(result).toBe('2.1.56');

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });

  it('returns null when version parsing fails', () => {
    const originalEnv = process.env['CLAUDECODE'];
    process.env['CLAUDECODE'] = '1';

    vi.mocked(execSync).mockReturnValue('invalid output\n' as any);

    const result = detectClaudeVersion();
    expect(result).toBe(null);

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test src/services/__tests__/user-agent.test.ts`
Expected: FAIL with "Cannot find module '../user-agent'"

**Step 3: Commit tests**

```bash
git add src/services/__tests__/user-agent.test.ts
git commit -m "test: add user-agent service tests"
```

---

## Task 3: Create User-Agent Service (Implementation)

**Files:**
- Create: `src/services/user-agent.ts`

**Step 1: Implement user-agent service**

Create implementation file:

```typescript
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from './logger';

/**
 * Fallback User-Agent when auto-detection fails
 */
const FALLBACK_UA = 'claude-cli/2.1.56 (external, cli)';

/**
 * Resolve User-Agent based on config value
 *
 * @param config - Config value (false/undefined/true/string)
 * @returns Resolved User-Agent string or null if no spoofing
 */
export function resolveUserAgent(
  config: boolean | string | undefined
): string | null {
  // No spoofing
  if (!config) {
    return null;
  }

  // Custom UA provided
  if (typeof config === 'string') {
    // Treat empty string as null
    return config || null;
  }

  // Auto-detect (config === true)
  return detectClaudeCodeUA();
}

/**
 * Detect Claude Code User-Agent with fallback
 *
 * @returns Claude Code UA string (detected or fallback)
 */
function detectClaudeCodeUA(): string {
  logger.debug('UA spoofing enabled, attempting detection');

  const version = detectClaudeVersion();
  if (version) {
    const ua = `claude-cli/${version} (external, cli)`;
    logger.debug(`Detected Claude Code version: ${version}`);
    return ua;
  }

  logger.debug(`Detection failed, using fallback: ${FALLBACK_UA}`);
  return FALLBACK_UA;
}

/**
 * Detect Claude Code version from CLI
 *
 * @returns Version string (e.g., "2.1.56") or null if detection fails
 */
export function detectClaudeVersion(): string | null {
  try {
    // Only try detection when running under Claude Code
    if (!process.env['CLAUDECODE']) {
      return null;
    }

    // Try to execute: ~/.claude/bin/claude --version
    const claudePath = join(homedir(), '.claude', 'bin', 'claude');
    const result = execSync(`"${claudePath}" --version`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Parse version from output (e.g., "claude-cli/2.1.56" or "2.1.56")
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    // Detection failed, return null to trigger fallback
    return null;
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `bun run test src/services/__tests__/user-agent.test.ts`
Expected: PASS (all tests green)

**Step 3: Verify build succeeds**

Run: `bun run build`
Expected: Success

**Step 4: Commit implementation**

```bash
git add src/services/user-agent.ts
git commit -m "feat: implement user-agent detection service"
```

---

## Task 4: Update HTTP Layer

**Files:**
- Modify: `src/providers/http.ts:145-149`

**Step 1: Add userAgent parameter to secureFetch**

Update function signature and add header logic:

```typescript
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000,
  userAgent?: string | null
): Promise<string> {
  // Security: Enforce HTTPS (with loopback exception)
  if (!isSecureUrl(url)) {
    throw new HttpError(`Insecure URL rejected (must be HTTPS or localhost): ${url}`);
  }

  // Get original hostname for redirect check
  const originalHostname = getHostname(url);
  if (!originalHostname) {
    throw new HttpError(`Invalid URL: ${url}`);
  }

  // Add timeout via AbortSignal
  const signal = AbortSignal.timeout(timeoutMs);

  // Build fetch options
  const fetchOptions: RequestInit = {
    ...options,
    redirect: 'manual',
    signal,
  };

  // Add User-Agent header if provided
  if (userAgent) {
    fetchOptions.headers = {
      ...options.headers,
      'User-Agent': userAgent,
    };
  }

  try {
    // Fetch with manual redirect handling
    const response = await fetch(url, fetchOptions);
    // ... rest of function unchanged
```

**Step 2: Verify TypeScript compiles**

Run: `bun run build`
Expected: Success

**Step 3: Run existing tests**

Run: `bun run test src/providers/__tests__/http.test.ts`
Expected: PASS (existing tests still work)

**Step 4: Commit**

```bash
git add src/providers/http.ts
git commit -m "feat: add userAgent parameter to secureFetch"
```

---

## Task 5: Update sub2api Provider

**Files:**
- Modify: `src/providers/sub2api.ts`

**Step 1: Import resolveUserAgent**

Add import at top of file:

```typescript
import { resolveUserAgent } from '../services/user-agent';
```

**Step 2: Update fetchUsage to use UA**

Find the `secureFetch` call in `fetchUsage` function (around line 152) and update:

```typescript
export async function fetchUsage(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  const url = `${baseUrl}/v1/usage`;

  // Resolve User-Agent
  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

  try {
    const body = await secureFetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      timeoutMs,
      resolvedUA
    );
    // ... rest unchanged
```

**Step 3: Import logger if not already imported**

Check if logger is imported, if not add:

```typescript
import { logger } from '../services/logger';
```

**Step 4: Verify TypeScript compiles**

Run: `bun run build`
Expected: Success

**Step 5: Run tests**

Run: `bun run test src/providers/__tests__/sub2api.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/providers/sub2api.ts
git commit -m "feat: add User-Agent support to sub2api provider"
```

---

## Task 6: Update claude-relay-service Provider

**Files:**
- Modify: `src/providers/claude-relay-service.ts`

**Step 1: Import resolveUserAgent**

Add import at top of file:

```typescript
import { resolveUserAgent } from '../services/user-agent';
```

**Step 2: Update fetchUsage to use UA**

Find the `secureFetch` call in `fetchUsage` function (around line 118) and update:

```typescript
export async function fetchUsage(
  baseUrl: string,
  token: string,
  config: Config,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  const url = `${baseUrl}/apiStats/api/user-stats`;

  // Resolve User-Agent
  const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);
  if (resolvedUA) {
    logger.debug(`Using User-Agent: ${resolvedUA}`);
  }

  try {
    const body = await secureFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: token }),
      },
      timeoutMs,
      resolvedUA
    );
    // ... rest unchanged
```

**Step 3: Import logger if not already imported**

Check if logger is imported, if not add:

```typescript
import { logger } from '../services/logger';
```

**Step 4: Verify TypeScript compiles**

Run: `bun run build`
Expected: Success

**Step 5: Run tests**

Run: `bun run test src/providers/__tests__/claude-relay-service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/providers/claude-relay-service.ts
git commit -m "feat: add User-Agent support to claude-relay-service provider"
```

---

## Task 7: Update Custom Provider

**Files:**
- Modify: `src/providers/custom.ts`

**Step 1: Import resolveUserAgent**

Add import at top of file:

```typescript
import { resolveUserAgent } from '../services/user-agent';
```

**Step 2: Update fetchUsage to support per-provider override**

Find the `secureFetch` call in `fetchUsage` function (around line 186) and update:

```typescript
export async function fetchUsage(
  baseUrl: string,
  token: string,
  config: Config,
  providerConfig: CustomProviderConfig,
  timeoutMs: number = 5000
): Promise<NormalizedUsage> {
  const url = `${baseUrl}${providerConfig.endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': providerConfig.contentType || 'application/json',
  };

  // Add auth header
  const prefix = providerConfig.auth.prefix || '';
  if (providerConfig.auth.type === 'header') {
    const headerName = providerConfig.auth.header || 'Authorization';
    headers[headerName] = `${prefix}${token}`;
  }

  // Build request body
  let requestBody: string | undefined;
  if (providerConfig.method === 'POST') {
    const bodyTemplate = providerConfig.requestBody || {};
    const body =
      providerConfig.auth.type === 'body'
        ? { ...bodyTemplate, [providerConfig.auth.bodyField || 'apiKey']: token }
        : bodyTemplate;
    requestBody = JSON.stringify(body);
  }

  // Resolve User-Agent with per-provider override
  const providerUA = providerConfig.spoofClaudeCodeUA;
  const globalUA = config.spoofClaudeCodeUA;
  const effectiveUA = providerUA !== undefined ? providerUA : globalUA;
  const resolvedUA = resolveUserAgent(effectiveUA);

  if (resolvedUA) {
    logger.debug(`Using User-Agent for ${providerConfig.id}: ${resolvedUA}`);
  }

  try {
    const body = await secureFetch(
      url,
      {
        method: providerConfig.method,
        headers,
        body: requestBody,
      },
      timeoutMs,
      resolvedUA
    );
    // ... rest unchanged
```

**Step 3: Import logger if not already imported**

Check if logger is imported, if not add:

```typescript
import { logger } from '../services/logger';
```

**Step 4: Verify TypeScript compiles**

Run: `bun run build`
Expected: Success

**Step 5: Run tests**

Run: `bun run test src/providers/__tests__/custom.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/providers/custom.ts
git commit -m "feat: add User-Agent support to custom provider with per-provider override"
```

---

## Task 8: Add Provider Integration Tests

**Files:**
- Modify: `src/providers/__tests__/sub2api.test.ts`
- Modify: `src/providers/__tests__/claude-relay-service.test.ts`
- Modify: `src/providers/__tests__/custom.test.ts`

**Step 1: Add User-Agent test to sub2api tests**

Add to `src/providers/__tests__/sub2api.test.ts`:

```typescript
it('sends User-Agent header when spoofClaudeCodeUA is true', async () => {
  const mockConfig = {
    ...DEFAULT_CONFIG,
    spoofClaudeCodeUA: true,
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response);

  await fetchUsage('https://api.sub2api.com', 'test-token', mockConfig);

  expect(mockFetch).toHaveBeenCalledWith(
    'https://api.sub2api.com/v1/usage',
    expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': expect.stringMatching(/^claude-cli\/[\d.]+/),
      }),
    })
  );
});

it('sends custom User-Agent when spoofClaudeCodeUA is string', async () => {
  const mockConfig = {
    ...DEFAULT_CONFIG,
    spoofClaudeCodeUA: 'custom-client/1.0',
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response);

  await fetchUsage('https://api.sub2api.com', 'test-token', mockConfig);

  expect(mockFetch).toHaveBeenCalledWith(
    'https://api.sub2api.com/v1/usage',
    expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': 'custom-client/1.0',
      }),
    })
  );
});

it('does not send User-Agent when spoofClaudeCodeUA is false', async () => {
  const mockConfig = {
    ...DEFAULT_CONFIG,
    spoofClaudeCodeUA: false,
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response);

  await fetchUsage('https://api.sub2api.com', 'test-token', mockConfig);

  const callHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
  expect(callHeaders['User-Agent']).toBeUndefined();
});
```

**Step 2: Add similar tests to claude-relay-service tests**

Add to `src/providers/__tests__/claude-relay-service.test.ts` (same pattern as above, adjusted for relay endpoint).

**Step 3: Add per-provider override tests to custom tests**

Add to `src/providers/__tests__/custom.test.ts`:

```typescript
it('respects per-provider User-Agent override', async () => {
  const providerConfig: CustomProviderConfig = {
    ...mockProviderConfig,
    spoofClaudeCodeUA: 'provider-specific/1.0',
  };

  const globalConfig = {
    ...DEFAULT_CONFIG,
    spoofClaudeCodeUA: 'global-ua/1.0',
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response);

  await fetchUsage('https://api.example.com', 'test-token', globalConfig, providerConfig);

  expect(mockFetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': 'provider-specific/1.0',
      }),
    })
  );
});

it('falls back to global User-Agent when per-provider not set', async () => {
  const providerConfig: CustomProviderConfig = {
    ...mockProviderConfig,
    // No spoofClaudeCodeUA set
  };

  const globalConfig = {
    ...DEFAULT_CONFIG,
    spoofClaudeCodeUA: 'global-ua/1.0',
  };

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockResponse,
  } as Response);

  await fetchUsage('https://api.example.com', 'test-token', globalConfig, providerConfig);

  expect(mockFetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': 'global-ua/1.0',
      }),
    })
  );
});
```

**Step 4: Run all provider tests**

Run: `bun run test src/providers/__tests__/`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/__tests__/
git commit -m "test: add User-Agent integration tests for all providers"
```

---

## Task 9: Add E2E Smoke Test

**Files:**
- Modify: `src/__tests__/e2e.test.ts`

**Step 1: Add E2E test for User-Agent config**

Add test case to E2E suite:

```typescript
it('handles spoofClaudeCodeUA config without crashing', async () => {
  const testConfigPath = join(tempDir, 'test-ua-config.json');
  writeFileSync(
    testConfigPath,
    JSON.stringify({
      spoofClaudeCodeUA: true,
      display: { layout: 'minimal' },
      components: { daily: true },
    })
  );

  const result = await runCLI(['--once', '--config', testConfigPath], {
    ANTHROPIC_BASE_URL: 'https://api.example.com',
    ANTHROPIC_AUTH_TOKEN: 'test-token',
    CLAUDE_CONFIG_DIR: tempDir,
    CC_API_STATUSLINE_CACHE_DIR: tempDir,
  });

  // Should not crash
  expect(result.exitCode).toBe(0);
  expect(result.stdout.length).toBeGreaterThan(0);
});

it('handles custom User-Agent string', async () => {
  const testConfigPath = join(tempDir, 'test-custom-ua-config.json');
  writeFileSync(
    testConfigPath,
    JSON.stringify({
      spoofClaudeCodeUA: 'custom-client/1.0.0',
      display: { layout: 'minimal' },
      components: { daily: true },
    })
  );

  const result = await runCLI(['--once', '--config', testConfigPath], {
    ANTHROPIC_BASE_URL: 'https://api.example.com',
    ANTHROPIC_AUTH_TOKEN: 'test-token',
    CLAUDE_CONFIG_DIR: tempDir,
    CC_API_STATUSLINE_CACHE_DIR: tempDir,
  });

  // Should not crash
  expect(result.exitCode).toBe(0);
  expect(result.stdout.length).toBeGreaterThan(0);
});
```

**Step 2: Run E2E tests**

Run: `bun run test src/__tests__/e2e.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/e2e.test.ts
git commit -m "test: add E2E smoke tests for User-Agent config"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/implementation-handbook.md`

**Step 1: Add config example to README.md**

Add section after "Configuration" heading (around line 107):

```markdown
### User-Agent Spoofing (Optional)

Some API providers restrict requests to only come from Claude Code clients. Enable User-Agent spoofing to bypass these restrictions:

```json
{
  "spoofClaudeCodeUA": true
}
```

**Options:**
- `false` / `undefined` — No User-Agent header (default)
- `true` — Auto-detect Claude Code version, fallback to `claude-cli/2.1.56 (external, cli)`
- `"string"` — Use custom User-Agent string

**Per-provider override (custom providers only):**

```json
{
  "spoofClaudeCodeUA": true,
  "customProviders": {
    "my-provider": {
      "spoofClaudeCodeUA": "custom-client/1.0.0"
    }
  }
}
```
```

**Step 2: Update implementation handbook**

Add to `docs/implementation-handbook.md` after environment variables section (around line 76):

```markdown
## 2.5 User-Agent Configuration

Optional User-Agent spoofing for API providers that restrict access to Claude Code clients.

Config field: `spoofClaudeCodeUA?: boolean | string`

Behavior:
- `false` / `undefined`: No User-Agent header sent (default)
- `true`: Auto-detect Claude Code version from `~/.claude/bin/claude --version`, fallback to `claude-cli/2.1.56 (external, cli)`
- `"string"`: Use exact User-Agent string provided

Per-provider override (custom providers only):
- `CustomProviderConfig.spoofClaudeCodeUA` overrides global setting

Detection logic:
1. Check `CLAUDECODE=1` env var (only detect when running under Claude Code)
2. Execute `~/.claude/bin/claude --version` with 1s timeout
3. Parse version from output (regex: `/(\d+\.\d+\.\d+)/`)
4. Fallback to hardcoded version if detection fails

Implementation: `src/services/user-agent.ts`
```

**Step 3: Verify documentation is clear**

Read through changes, ensure examples are correct.

**Step 4: Commit**

```bash
git add README.md docs/implementation-handbook.md
git commit -m "docs: add User-Agent configuration documentation"
```

---

## Task 11: Final Verification

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `bun run check`
Expected: All 356+ tests pass, lint clean

**Step 2: Manual smoke test with debug logging**

```bash
# Create test config
cat > /tmp/test-ua-config.json <<EOF
{
  "spoofClaudeCodeUA": true,
  "display": { "layout": "minimal" },
  "components": { "daily": true }
}
EOF

# Run with debug logging
DEBUG=1 bun run build && node dist/cc-api-statusline.js --once --config /tmp/test-ua-config.json

# Check debug log shows UA detection
tail -20 ~/.claude/cc-api-statusline/debug.log
```

Expected: Debug log shows "UA spoofing enabled, attempting detection" and chosen UA.

**Step 3: Test with custom UA string**

```bash
cat > /tmp/test-custom-ua-config.json <<EOF
{
  "spoofClaudeCodeUA": "my-custom-client/1.0.0",
  "display": { "layout": "minimal" },
  "components": { "daily": true }
}
EOF

DEBUG=1 node dist/cc-api-statusline.js --once --config /tmp/test-custom-ua-config.json
tail -20 ~/.claude/cc-api-statusline/debug.log
```

Expected: Debug log shows "Using User-Agent: my-custom-client/1.0.0"

**Step 4: Final commit if any fixes needed**

If you had to fix anything:

```bash
git add .
git commit -m "fix: final adjustments for User-Agent feature"
```

---

## Success Criteria Checklist

- [ ] `spoofClaudeCodeUA` config option works (boolean and string)
- [ ] Auto-detection attempts to read Claude Code version
- [ ] Fallback to `claude-cli/2.1.56 (external, cli)` when detection fails
- [ ] Custom UA strings work correctly
- [ ] Per-provider overrides work for custom providers
- [ ] All tests pass (`bun run check`)
- [ ] Debug logging shows UA detection process
- [ ] No performance impact (detection is fast, failures are silent)
- [ ] Documentation updated (README.md, handbook)

---

## Testing Commands Reference

```bash
# Unit tests
bun run test src/services/__tests__/user-agent.test.ts

# Provider tests
bun run test src/providers/__tests__/

# E2E tests
bun run test src/__tests__/e2e.test.ts

# Full gate
bun run check

# Manual debug test
DEBUG=1 bun run start

# View debug log
tail -f ~/.claude/cc-api-statusline/debug.log
```
