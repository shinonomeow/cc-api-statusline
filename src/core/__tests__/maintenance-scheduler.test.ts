import { describe, it, expect, vi, afterEach } from 'vitest';
import { selectMaintenanceTask, computeDynamicDetectionTtl } from '../maintenance-scheduler.js';
import type { MaintenanceContext, ProbeOutcome } from '../maintenance-scheduler.js';

describe('selectMaintenanceTask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('non-A/B paths always return none', () => {
    it('returns none for Path C', () => {
      const ctx: MaintenanceContext = { path: 'C', detectionCacheAgeMs: null, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('none');
    });

    it('returns none for Path D', () => {
      const ctx: MaintenanceContext = { path: 'D', detectionCacheAgeMs: null, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('none');
    });

    it('returns none for Path B2', () => {
      const ctx: MaintenanceContext = { path: 'B2', detectionCacheAgeMs: null, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('none');
    });
  });

  describe('Path A: health-probe priority', () => {
    it('returns health-probe when no detection cache (null age)', () => {
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: null, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });

    it('returns health-probe when age is exactly 50% of TTL', () => {
      // 43200000ms = 12h = 50% of 24h TTL
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 43200000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });

    it('returns health-probe when age exceeds 50% of TTL', () => {
      // 50000000ms > 43200000ms (50% of 86400000ms)
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 50000000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });

    it('returns health-probe when age is 100% of TTL', () => {
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 86400000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });
  });

  describe('Path B: health-probe priority', () => {
    it('returns health-probe when no detection cache (null age)', () => {
      const ctx: MaintenanceContext = { path: 'B', detectionCacheAgeMs: null, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });

    it('returns health-probe when cache is past 50% TTL', () => {
      const ctx: MaintenanceContext = { path: 'B', detectionCacheAgeMs: 50000000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });
  });

  describe('cache-gc probabilistic selection', () => {
    it('returns cache-gc when Math.random() < 0.10 and cache is fresh', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.05); // below 0.10 threshold
      // Fresh cache: 1000ms age << 50% of 86400000ms TTL
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 1000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('cache-gc');
    });

    it('returns none when Math.random() >= 0.10 and cache is fresh', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.50); // above 0.10 threshold
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 1000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('none');
    });

    it('health-probe takes priority over cache-gc regardless of random', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // would trigger GC
      // But cache age is past 50% TTL → probe wins
      const ctx: MaintenanceContext = { path: 'A', detectionCacheAgeMs: 50000000, detectionCacheTtlMs: 86400000 };
      expect(selectMaintenanceTask(ctx)).toBe('health-probe');
    });
  });
});

describe('computeDynamicDetectionTtl', () => {
  describe('probe failed → DETECTION_TTL_FAILED_S (300)', () => {
    it('returns 300 when success=false regardless of provider', () => {
      const outcome: ProbeOutcome = { success: false, matchedProvider: null, responseTimeMs: 50 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 86400)).toBe(300);
    });

    it('returns 300 even if matchedProvider is set but success=false', () => {
      const outcome: ProbeOutcome = { success: false, matchedProvider: 'sub2api', responseTimeMs: 50 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 86400)).toBe(300);
    });
  });

  describe('provider changed → DETECTION_TTL_CHANGED_S (3600)', () => {
    it('returns 3600 when matched provider differs from current provider', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'crs', responseTimeMs: 100 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 86400)).toBe(3600);
    });

    it('returns 3600 when matched provider is null (provider gone)', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: null, responseTimeMs: 100 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 86400)).toBe(3600);
    });
  });

  describe('stable provider → double TTL (capped at 604800)', () => {
    it('doubles 24h TTL to 48h', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'sub2api', responseTimeMs: 100 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 86400)).toBe(172800);
    });

    it('doubles 48h TTL to 96h', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'sub2api', responseTimeMs: 100 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 172800)).toBe(345600);
    });

    it('caps at 7 days (604800) when doubling would exceed', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'sub2api', responseTimeMs: 100 };
      // 345600 * 2 = 691200 > 604800 → capped
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 345600)).toBe(604800);
    });

    it('returns exactly 604800 when already at cap', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'sub2api', responseTimeMs: 100 };
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 604800)).toBe(604800);
    });

    it('grows from 1h after provider-change recovery', () => {
      const outcome: ProbeOutcome = { success: true, matchedProvider: 'sub2api', responseTimeMs: 100 };
      // Provider was sub2api, changed to crs (3600), now back to sub2api
      expect(computeDynamicDetectionTtl(outcome, 'sub2api', 3600)).toBe(7200);
    });
  });
});
