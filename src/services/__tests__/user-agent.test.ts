import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUserAgent, detectClaudeVersion } from '../user-agent.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

describe('resolveUserAgent', () => {
  let originalClaudeCodeEnv: string | undefined;

  beforeEach(() => {
    originalClaudeCodeEnv = process.env['CLAUDECODE'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalClaudeCodeEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalClaudeCodeEnv;
    }
    vi.restoreAllMocks();
  });

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
    mockExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
    const result = resolveUserAgent(true);
    expect(result).toBe('claude-cli/2.1.56 (external, cli)');
  });

  it('returns detected UA when true and detection succeeds', () => {
    process.env['CLAUDECODE'] = '1';
    mockExecSync.mockReturnValue('claude-cli/2.2.0\n');
    const result = resolveUserAgent(true);
    expect(result).toBe('claude-cli/2.2.0 (external, cli)');
  });
});

describe('detectClaudeVersion', () => {
  let originalClaudeCodeEnv: string | undefined;

  beforeEach(() => {
    originalClaudeCodeEnv = process.env['CLAUDECODE'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalClaudeCodeEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalClaudeCodeEnv;
    }
    vi.restoreAllMocks();
  });

  it('returns null when CLAUDECODE env var not set', () => {
    delete process.env['CLAUDECODE'];
    const result = detectClaudeVersion();
    expect(result).toBe(null);
  });

  it('returns null when CLI execution fails', () => {
    process.env['CLAUDECODE'] = '1';
    mockExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });
    const result = detectClaudeVersion();
    expect(result).toBe(null);
  });

  it('parses version from CLI output with prefix', () => {
    process.env['CLAUDECODE'] = '1';
    mockExecSync.mockReturnValue('claude-cli/2.1.56\n');
    const result = detectClaudeVersion();
    expect(result).toBe('2.1.56');
  });

  it('parses version from CLI output without prefix', () => {
    process.env['CLAUDECODE'] = '1';
    mockExecSync.mockReturnValue('2.1.56\n');
    const result = detectClaudeVersion();
    expect(result).toBe('2.1.56');
  });

  it('returns null when version parsing fails', () => {
    process.env['CLAUDECODE'] = '1';
    mockExecSync.mockReturnValue('invalid output\n');
    const result = detectClaudeVersion();
    expect(result).toBe(null);
  });
});
