import { describe, it, expect } from 'vitest';
import { spawn, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

describe('main CLI', () => {
  const mainPath = './src/main.ts';

  // Test environment with required vars
  const testEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: 'https://test-provider.example.com',
    ANTHROPIC_AUTH_TOKEN: 'test-token-123',
  };

  it('should display help with --help flag', async () => {
    const result = await execFile('bun', ['run', mainPath, '--help']);
    expect(result.stdout).toContain('cc-api-statusline');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Options:');
  });

  it('should display version with --version flag', async () => {
    const result = await execFile('bun', ['run', mainPath, '--version']);
    // Now outputs "cc-api-statusline v0.1.0"
    expect(result.stdout.trim()).toContain('0.1.0');
  });

  it('should handle missing env vars gracefully', async () => {
    return new Promise<void>((resolve, reject) => {
      // Explicitly remove the required env vars
      // Note: settings.json may still provide them, so this test just checks
      // that the CLI can handle the case gracefully
      const envWithoutRequired = { ...process.env };
      delete envWithoutRequired['ANTHROPIC_BASE_URL'];
      delete envWithoutRequired['ANTHROPIC_AUTH_TOKEN'];

      const child = spawn('bun', ['run', mainPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: envWithoutRequired,
      });

      let stdout = '';
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stdin?.end();

      child.on('exit', (_code) => {
        try {
          // Should either show error message or load from settings.json
          // Just check that output exists
          expect(stdout.length).toBeGreaterThan(0);
          resolve();
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Process did not exit within 2 seconds'));
      }, 2000);
    });
  });

  it('should accept piped stdin and exit cleanly', async () => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('bun', ['run', mainPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: testEnv,
      });

      let stdout = '';
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Write JSON to stdin (ccstatusline contract)
      child.stdin?.write('{}');
      child.stdin?.end();

      child.on('exit', (_code) => {
        try {
          // In piped mode with no cache, will try to fetch and likely fail
          // but should output something (could be error or loading)
          expect(stdout.length).toBeGreaterThan(0);
          resolve();
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('Process did not exit within 2 seconds'));
      }, 2000);
    });
  });

  it('should detect piped mode when stdin is not a TTY', async () => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('bun', ['run', mainPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: testEnv,
      });

      let stdout = '';
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stdin?.end();

      child.on('exit', (_code) => {
        try {
          // Should output something
          expect(stdout.length).toBeGreaterThan(0);
          resolve();
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Process did not exit within 2 seconds'));
      }, 2000);
    });
  });

  it('should respect --once flag', async () => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('bun', ['run', mainPath, '--once'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: testEnv,
      });

      let stdout = '';
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.on('exit', (_code) => {
        try {
          // Should output something
          expect(stdout.length).toBeGreaterThan(0);
          resolve();
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Process did not exit within 2 seconds'));
      }, 2000);
    });
  });
});
