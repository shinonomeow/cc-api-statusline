import { describe, it, expect } from 'vitest';
import { sha256, shortHash } from '../hash.js';

describe('hash service', () => {
  describe('sha256', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const input = 'test data';
      const hash1 = sha256(input);
      const hash2 = sha256(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe('916f0027a575074ce72a331777c3478d6513f786a591bd892da1a577bf2335f9');
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('input1');
      const hash2 = sha256('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string', () => {
      const hash = sha256('any input');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle empty string', () => {
      const hash = sha256('');

      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode characters', () => {
      const hash1 = sha256('hello 世界');
      const hash2 = sha256('hello 世界');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('shortHash', () => {
    it('should return first 12 characters by default', () => {
      const input = 'test data';
      const short = shortHash(input);
      const full = sha256(input);

      expect(short).toBe(full.slice(0, 12));
      expect(short).toHaveLength(12);
    });

    it('should accept custom length', () => {
      const input = 'test data';
      const short8 = shortHash(input, 8);
      const short16 = shortHash(input, 16);
      const full = sha256(input);

      expect(short8).toBe(full.slice(0, 8));
      expect(short16).toBe(full.slice(0, 16));
    });

    it('should produce deterministic results', () => {
      const input = 'consistent';
      const short1 = shortHash(input, 10);
      const short2 = shortHash(input, 10);

      expect(short1).toBe(short2);
    });

    it('should produce different results for different inputs', () => {
      const short1 = shortHash('input1', 12);
      const short2 = shortHash('input2', 12);

      expect(short1).not.toBe(short2);
    });
  });
});
