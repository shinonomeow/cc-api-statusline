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

    vi.mocked(execSync).mockReturnValue('claude-cli/2.2.0\n');

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

    vi.mocked(execSync).mockReturnValue('claude-cli/2.1.56\n');

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

    vi.mocked(execSync).mockReturnValue('2.1.56\n');

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

    vi.mocked(execSync).mockReturnValue('invalid output\n');

    const result = detectClaudeVersion();
    expect(result).toBe(null);

    if (originalEnv === undefined) {
      delete process.env['CLAUDECODE'];
    } else {
      process.env['CLAUDECODE'] = originalEnv;
    }
  });
});
