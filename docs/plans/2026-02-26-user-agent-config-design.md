# User-Agent Configuration for Claude Code Compatibility

**Date:** 2026-02-26
**Status:** Approved

## Problem

Some sub2api instances restrict API requests to only come from Claude Code clients by checking the User-Agent header. Currently, cc-api-statusline does not set a User-Agent, causing these requests to be blocked.

## Goals

1. Allow users to spoof Claude Code's User-Agent to bypass restrictions
2. Auto-detect Claude Code version when possible
3. Provide fallback for when detection fails
4. Support custom User-Agent strings for flexibility
5. Make it opt-in (disabled by default to preserve current behavior)

## Non-Goals

- Detecting all possible Claude Code versions perfectly
- Supporting User-Agent spoofing for non-HTTP protocols
- Backward compatibility for this new feature

## Solution Overview

Add `spoofClaudeCodeUA` configuration option (global + per-provider override) that accepts:
- `false` / `undefined`: No UA spoofing (default)
- `true`: Auto-detect Claude Code version, fallback to `claude-cli/2.1.56 (external, cli)`
- `"string"`: Use exact User-Agent string provided

## Detailed Design

### 1. Configuration Schema

#### Global Config (`src/types/config.ts`)

```typescript
export interface Config {
  display: DisplayConfig;
  components: ComponentsConfig;
  colors?: ColorsConfig;
  spoofClaudeCodeUA?: boolean | string;  // NEW
  customProviders?: Record<string, CustomProviderConfig>;
  pollIntervalSeconds?: number;
  pipedRequestTimeoutMs?: number;
}
```

#### Per-Provider Override

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
  spoofClaudeCodeUA?: boolean | string;  // NEW: per-provider override
}
```

#### Precedence Rules

1. Per-provider `spoofClaudeCodeUA` overrides global setting
2. Built-in providers (sub2api, claude-relay-service) respect global setting only
3. Default behavior (no config): No User-Agent header sent

#### Example Config

```json
{
  "spoofClaudeCodeUA": true,
  "customProviders": {
    "my-provider": {
      "spoofClaudeCodeUA": "custom-client/1.0.0"
    },
    "another-provider": {
      "spoofClaudeCodeUA": false
    }
  }
}
```

### 2. Version Detection Logic

#### New Service: `src/services/user-agent.ts`

```typescript
export function resolveUserAgent(
  config: boolean | string | undefined
): string | null {
  // No spoofing
  if (!config) return null;

  // Custom UA provided
  if (typeof config === 'string') {
    return config || null; // Treat empty string as null
  }

  // Auto-detect (config === true)
  return detectClaudeCodeUA();
}

function detectClaudeCodeUA(): string {
  const FALLBACK_UA = 'claude-cli/2.1.56 (external, cli)';

  const version = detectClaudeVersion();
  if (version) {
    return `claude-cli/${version} (external, cli)`;
  }

  return FALLBACK_UA;
}

function detectClaudeVersion(): string | null {
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
      stdio: ['ignore', 'pipe', 'ignore']
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

#### Detection Strategy

1. **Check `CLAUDECODE` env var** — Only attempt detection when running under Claude Code
2. **Execute `~/.claude/bin/claude --version`** — Parse version from output
3. **Fallback to `claude-cli/2.1.56 (external, cli)`** — If detection fails
4. **Never block execution** — All errors return fallback, never throw

#### Edge Cases Handled

- Claude CLI not installed → Use fallback
- CLI execution fails → Use fallback
- Version parsing fails → Use fallback
- Not running under Claude Code → Use fallback
- Empty string config → Treat as `false`

### 3. Provider Integration

#### HTTP Layer Changes (`src/providers/http.ts`)

```typescript
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000,
  userAgent?: string | null  // NEW parameter
): Promise<string> {
  // Security checks (unchanged)...

  const fetchOptions: RequestInit = {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  };

  // Add User-Agent header if provided
  if (userAgent) {
    fetchOptions.headers = {
      ...options.headers,
      'User-Agent': userAgent,
    };
  }

  const response = await fetch(url, fetchOptions);
  // ... rest unchanged
}
```

#### Built-in Providers (sub2api, claude-relay-service)

```typescript
// In fetchUsage() function
const resolvedUA = resolveUserAgent(config.spoofClaudeCodeUA);

const body = await secureFetch(
  url,
  {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  },
  timeoutMs,
  resolvedUA  // Pass resolved UA
);
```

#### Custom Providers (`src/providers/custom.ts`)

```typescript
// Resolve UA with per-provider override
const providerUA = providerConfig.spoofClaudeCodeUA;
const globalUA = config.spoofClaudeCodeUA;
const effectiveUA = providerUA !== undefined ? providerUA : globalUA;
const resolvedUA = resolveUserAgent(effectiveUA);

const body = await secureFetch(
  url,
  {
    method: providerConfig.method,
    headers: headers,
    body: requestBody
  },
  timeoutMs,
  resolvedUA
);
```

### 4. Error Handling & Debug Logging

#### Error Handling Principles

- **Silent failures**: Version detection failures don't block execution
- **Always fallback**: Never leave user without a working UA
- **No exceptions**: `detectClaudeVersion()` never throws

#### Invalid Config Handling

| Config Value | Treatment |
|--------------|-----------|
| `false` / `undefined` | No UA spoofing |
| `true` | Auto-detect with fallback |
| `"valid-string"` | Use exact string |
| `""` (empty string) | Treated as `false` |
| `123` (non-string/boolean) | Validation warning, treated as `false` |

#### Debug Logging

```typescript
// In user-agent.ts
logger.debug('UA spoofing enabled, attempting detection');
logger.debug(`Detected Claude Code version: ${version}`);
logger.debug(`Detection failed, using fallback: ${FALLBACK_UA}`);

// In providers
logger.debug(`Using User-Agent: ${resolvedUA}`);
```

**Example debug output:**
```
[2026-02-26 10:30:45] UA spoofing enabled, attempting detection
[2026-02-26 10:30:45] Detected Claude Code version: 2.1.56
[2026-02-26 10:30:45] Using User-Agent: claude-cli/2.1.56 (external, cli)
```

### 5. Testing Strategy

#### Unit Tests (`src/services/__tests__/user-agent.test.ts`)

- `resolveUserAgent(false)` returns `null`
- `resolveUserAgent(undefined)` returns `null`
- `resolveUserAgent("")` returns `null`
- `resolveUserAgent("custom-ua")` returns `"custom-ua"`
- `resolveUserAgent(true)` returns valid UA string
- `detectClaudeVersion()` handles missing CLI gracefully
- `detectClaudeVersion()` parses version from CLI output
- `detectClaudeVersion()` returns null when `CLAUDECODE` not set

#### Provider Integration Tests

- sub2api sends User-Agent when `spoofClaudeCodeUA: true`
- claude-relay-service sends User-Agent
- custom provider respects per-provider override
- custom provider falls back to global config
- Built-in providers work with global config

#### Config Validation Tests

- Invalid config values rejected/normalized
- Empty string treated as `false`
- Per-provider override precedence

#### E2E Smoke Test

- Build dist with `spoofClaudeCodeUA: true`
- Run `--once`, verify no crashes
- Check debug log shows detection attempt

#### Manual Testing Checklist

- [ ] Enable `spoofClaudeCodeUA: true` in config
- [ ] Run `DEBUG=1 bun run start`
- [ ] Verify debug log shows UA detection
- [ ] Confirm sub2api request succeeds (not blocked)
- [ ] Test custom UA: `"spoofClaudeCodeUA": "custom/1.0"`
- [ ] Test per-provider override in custom provider

## Implementation Plan

### Phase 1: Core Infrastructure
1. Add `spoofClaudeCodeUA` to config types
2. Implement `src/services/user-agent.ts`
3. Add unit tests for user-agent service

### Phase 2: Provider Integration
4. Update `secureFetch()` signature with `userAgent` parameter
5. Update sub2api provider to use UA
6. Update claude-relay-service provider to use UA
7. Update custom provider with per-provider override logic

### Phase 3: Testing & Documentation
8. Add provider integration tests
9. Add E2E smoke test
10. Update README.md with configuration examples
11. Update docs/implementation-handbook.md

## Success Criteria

- [ ] Users can enable `spoofClaudeCodeUA: true` and bypass sub2api restrictions
- [ ] Auto-detection works when running under Claude Code
- [ ] Fallback UA works when detection fails
- [ ] Custom UA strings work correctly
- [ ] Per-provider overrides work for custom providers
- [ ] All tests pass (`bun run check`)
- [ ] Debug logging shows UA detection process
- [ ] No performance impact (detection cached in config resolution)

## Alternatives Considered

### Alternative 1: Always-On UA Spoofing
- **Rejected**: Changes default behavior, could break existing setups

### Alternative 2: Only Static Fallback Version
- **Rejected**: Requires updating hardcoded version regularly

### Alternative 3: Version Cache File
- **Rejected**: Adds complexity, cache state management

## Open Questions

None - design approved.

## References

- User request: Add UA config for sub2api compatibility
- Claude Code UA format: `claude-cli/X.Y.Z (external, cli)`
- Environment: `CLAUDECODE=1` indicates running under Claude Code
