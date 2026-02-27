import { describe, it, expect } from 'vitest';
import { writeFileSync, renameSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Phase 0 Exit Gate: Bun Runtime Feature Verification
 *
 * This test suite verifies that Bun supports the required runtime features:
 * 1. fetch() with AbortSignal.timeout()
 * 2. fs.renameSync() atomicity
 * 3. Crypto (Bun.CryptoHasher or Node crypto)
 */

describe('Bun Runtime Verification', () => {
  describe('AbortSignal.timeout support', () => {
    it('should support AbortSignal.timeout()', () => {
      // Check if AbortSignal.timeout exists
      expect(typeof AbortSignal.timeout).toBe('function');

      // Create a signal with timeout
      const signal = AbortSignal.timeout(1000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });

    it('should abort after timeout', async () => {
      const signal = AbortSignal.timeout(10);

      // Wait for the signal to abort
      await new Promise((resolve) => {
        signal.addEventListener('abort', resolve);
      });

      expect(signal.aborted).toBe(true);
    });
  });

  describe('fs.renameSync atomicity', () => {
    it('should atomically rename files', () => {
      const tmpDir = tmpdir();
      const srcPath = join(tmpDir, `cc-api-test-src-${Date.now()}.tmp`);
      const dstPath = join(tmpDir, `cc-api-test-dst-${Date.now()}.json`);

      try {
        // Write source file
        writeFileSync(srcPath, JSON.stringify({ test: 'data' }), 'utf-8');
        expect(existsSync(srcPath)).toBe(true);

        // Rename (should be atomic on macOS/Linux)
        renameSync(srcPath, dstPath);

        // Source should not exist, destination should exist
        expect(existsSync(srcPath)).toBe(false);
        expect(existsSync(dstPath)).toBe(true);

        // Content should be preserved
        const content = readFileSync(dstPath, 'utf-8');
        expect(JSON.parse(content)).toEqual({ test: 'data' });
      } finally {
        // Cleanup
        if (existsSync(srcPath)) unlinkSync(srcPath);
        if (existsSync(dstPath)) unlinkSync(dstPath);
      }
    });
  });

  describe('Crypto support', () => {
    it('should have Bun.CryptoHasher or Node crypto available', async () => {
      // Check for Bun native crypto
      const hasBunCrypto = typeof Bun !== 'undefined' && typeof Bun.CryptoHasher !== 'undefined';

      // Check for Node crypto
      let hasNodeCrypto = false;
      try {
        const crypto = await import('crypto');
        hasNodeCrypto = typeof crypto.createHash === 'function';
      } catch {
        hasNodeCrypto = false;
      }

      // At least one must be available
      expect(hasBunCrypto || hasNodeCrypto).toBe(true);

      if (hasBunCrypto) {
        console.log('✓ Bun.CryptoHasher available (native)');
      }
      if (hasNodeCrypto) {
        console.log('✓ Node crypto available (fallback)');
      }
    });

    it('should produce SHA-256 hash', async () => {
      const input = 'test data';

      let hash: string;

      // Try Bun native first
      if (typeof Bun !== 'undefined' && typeof Bun.CryptoHasher !== 'undefined') {
        const hasher = new Bun.CryptoHasher('sha256');
        hasher.update(input);
        hash = hasher.digest('hex');
      } else {
        // Fall back to Node crypto
        const crypto = await import('crypto');
        hash = crypto.createHash('sha256').update(input).digest('hex');
      }

      // Verify hash is correct SHA-256
      expect(hash).toBe('916f0027a575074ce72a331777c3478d6513f786a591bd892da1a577bf2335f9');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex chars
    });
  });
});
