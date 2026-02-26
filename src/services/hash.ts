/**
 * SHA-256 hashing with Bun/Node compatibility
 */

/**
 * Compute SHA-256 hash of input string
 *
 * Uses Bun.CryptoHasher if available (native, faster),
 * falls back to Node crypto module.
 */
export function sha256(input: string): string {
  // Try Bun native crypto first
  if (typeof Bun !== 'undefined' && typeof Bun.CryptoHasher !== 'undefined') {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(input);
    return hasher.digest('hex');
  }

  // Fall back to Node crypto
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Compute short hash (first N characters of SHA-256)
 *
 * Used for cache file names and token hashing
 */
export function shortHash(input: string, length: number = 12): string {
  const fullHash = sha256(input);
  return fullHash.slice(0, length);
}
