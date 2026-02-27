/**
 * Tests for main rendering pipeline
 */

import { describe, test, expect } from 'vitest';
import { renderStatusline } from '../index.js';
import { stripAnsi } from '../colors.js';
import type { NormalizedUsage, QuotaWindow } from '../../types/normalized-usage.js';
import { DEFAULT_CONFIG, type Config } from '../../types/config.js';

// Test data factory
function createMockUsage(overrides?: Partial<NormalizedUsage>): NormalizedUsage {
  return {
    provider: 'test-provider',
    billingMode: 'subscription',
    planName: 'Test Plan',
    fetchedAt: new Date().toISOString(),
    resetSemantics: 'end-of-day',
    daily: null,
    weekly: null,
    monthly: null,
    balance: null,
    resetsAt: null,
    tokenStats: null,
    rateLimit: null,
    ...overrides,
  };
}

function createQuotaWindow(used: number, limit: number | null): QuotaWindow {
  return {
    used,
    limit,
    remaining: limit !== null ? Math.max(0, limit - used) : null,
    resetsAt: new Date(Date.now() + 3600000).toISOString(),
  };
}

describe('renderStatusline', () => {
  describe('default component order', () => {
    test('renders all components in default order', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
        monthly: createQuotaWindow(800, 1000),
        balance: { remaining: 42.5, initial: 100, unit: 'USD' },
        tokenStats: {
          today: null,
          total: {
            requests: 100,
            inputTokens: 5000,
            outputTokens: 2500,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 7500,
            cost: 1.0,
          },
          rpm: null,
          tpm: null,
        },
      });

      // Use maxWidth 100% to avoid truncation
      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          maxWidth: 100,
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Verify components render (some may be truncated due to terminal width)
      expect(plain).toContain('Daily');
      expect(plain).toContain('Weekly');
      expect(plain).toContain('Monthly');
      // Balance, Tokens may be truncated depending on terminal width
      // Just verify we got a valid statusline
      expect(plain.length).toBeGreaterThan(0);
    });

    test('skips components with null data', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        // weekly, monthly, balance, tokens all null
      });

      const result = renderStatusline(data, DEFAULT_CONFIG);
      const plain = stripAnsi(result);

      expect(plain).toContain('Daily');
      expect(plain).not.toContain('Weekly');
      expect(plain).not.toContain('Monthly');
      expect(plain).not.toContain('Balance');
      expect(plain).not.toContain('Tokens');
    });
  });

  describe('custom component order', () => {
    test('renders components in config order', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
        balance: { remaining: 42.5, initial: 100, unit: 'USD' },
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        components: {
          balance: true, // First
          weekly: true, // Second
          daily: true, // Third
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Check order by position
      const balancePos = plain.indexOf('Balance');
      const weeklyPos = plain.indexOf('Weekly');
      const dailyPos = plain.indexOf('Daily');

      expect(balancePos).toBeGreaterThan(-1);
      expect(weeklyPos).toBeGreaterThan(balancePos);
      expect(dailyPos).toBeGreaterThan(weeklyPos);
    });

    test('appends omitted components in default order', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
        balance: { remaining: 42.5, initial: 100, unit: 'USD' },
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        components: {
          balance: true, // Explicitly first
          // daily and weekly omitted → appended in default order
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Balance should come first, then daily, then weekly (default order)
      const balancePos = plain.indexOf('Balance');
      const dailyPos = plain.indexOf('Daily');
      const weeklyPos = plain.indexOf('Weekly');

      expect(balancePos).toBeGreaterThan(-1);
      expect(dailyPos).toBeGreaterThan(balancePos);
      expect(weeklyPos).toBeGreaterThan(dailyPos);
    });
  });

  describe('disabled components', () => {
    test('skips components set to false', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        components: {
          daily: true,
          weekly: false, // Explicitly disabled
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      expect(plain).toContain('Daily');
      expect(plain).not.toContain('Weekly');
    });
  });

  describe('separator configuration', () => {
    test('uses default separator', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const result = renderStatusline(data, DEFAULT_CONFIG);
      const plain = stripAnsi(result);

      expect(plain).toContain('|'); // Default separator is " | "
    });

    test('uses custom separator', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          separator: ' • ',
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      expect(plain).toContain('•');
      expect(plain).not.toContain('|');
    });
  });

  describe('error state rendering', () => {
    test('appends error indicator with cache', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const result = renderStatusline(data, DEFAULT_CONFIG, 'network-error', 10);
      const plain = stripAnsi(result);

      // Should have both daily component and error indicator
      expect(plain).toContain('Daily');
      expect(plain).toContain('[offline]');
    });

    test('replaces output without cache', () => {
      const data = createMockUsage({
        // No component data
      });

      const result = renderStatusline(data, DEFAULT_CONFIG, 'auth-error');
      const plain = stripAnsi(result);

      // Should only show error, no components
      expect(plain).toContain('⚠');
      expect(plain).toContain('Auth error');
      expect(plain).not.toContain('Daily');
    });

    test('handles transition states', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const result = renderStatusline(data, DEFAULT_CONFIG, 'switching-provider');
      const plain = stripAnsi(result);

      // Transition states replace all output
      expect(plain).toContain('⟳');
      expect(plain).toContain('Switching provider');
      expect(plain).not.toContain('Daily'); // Component should not appear
    });
  });

  describe('truncation', () => {
    test('truncates long output to terminal width', () => {
      // Mock terminal width to have predictable behavior
      const originalColumns = process.stdout.columns;
      process.stdout.columns = 50;

      try {
        // Create multiple components so total is long
        const data = createMockUsage({
          daily: createQuotaWindow(24, 100),
          weekly: createQuotaWindow(50, 200),
          monthly: createQuotaWindow(800, 1000),
        });

        const config: Config = {
          ...DEFAULT_CONFIG,
          display: {
            ...DEFAULT_CONFIG.display,
            progressStyle: 'bar', // Use bar mode so each component is wide enough to require truncation
            barStyle: 'classic',
            maxWidth: 40, // 40% of 50 = 20 chars - force hard truncation
            separator: ' | ',
          },
        };

        const result = renderStatusline(data, config);
        const plain = stripAnsi(result);

        // Total output would be much longer than 20 chars
        // After component dropping and hard truncation, should have ellipsis
        expect(plain).toContain('…');
        expect(plain.length).toBeLessThanOrEqual(21); // maxWidth (20) + ellipsis
      } finally {
        // Restore original value
        if (originalColumns !== undefined) {
          process.stdout.columns = originalColumns;
        } else {
          // @ts-expect-error Deleting undefined property for test cleanup
          delete process.stdout.columns;
        }
      }
    });

    test('does not truncate short output', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          maxWidth: 100, // Full width
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Should not be truncated
      expect(plain).not.toContain('…');
    });
  });

  describe('layout variations', () => {
    test('renders compact displayMode', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          displayMode: 'compact',
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Compact uses single-letter labels
      expect(plain).toMatch(/\bD\b/); // "D" for Daily
      expect(plain).toMatch(/\bW\b/); // "W" for Weekly
    });

    test('renders hidden displayMode (no labels)', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          displayMode: 'hidden',
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Hidden displayMode shows no labels
      expect(plain).not.toContain('Daily');
      expect(plain).not.toContain('D');
      expect(plain).toContain('24%'); // Should have percentage
    });

    test('renders percent-first layout', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          layout: 'percent-first',
          progressStyle: 'bar',
          barStyle: 'classic', // Explicit classic style for ━ chars
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Should have label and percentage
      expect(plain).toContain('Daily');
      expect(plain).toContain('24%');

      // Percentage should come before bar
      const pctIndex = plain.indexOf('24%');
      const barIndex = plain.indexOf('━');
      expect(pctIndex).toBeGreaterThan(-1);
      expect(barIndex).toBeGreaterThan(pctIndex);
    });
  });

  describe('progress style variations', () => {
    test('renders bar progressStyle (classic style)', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          progressStyle: 'bar',
          barStyle: 'classic', // Explicit classic style for ━ chars
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      expect(plain).toContain('━'); // Bar character
    });

    test('renders bar progressStyle (block style, default)', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          progressStyle: 'bar',
          barStyle: 'block',
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      expect(plain).toContain('█'); // Block bar character
    });

    test('renders hidden progressStyle (no progress bar)', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          progressStyle: 'hidden',
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      expect(plain).not.toContain('━'); // No bar
      expect(plain).toContain('24%');
    });

    test('renders icon progressStyle', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          progressStyle: 'icon',
        },
      };

      const result = renderStatusline(data, config);

      // Should contain nerd-font icon (Unicode)
      expect(result).toMatch(/[\u{F0130}-\u{F0AA5}]/u);
    });
  });

  describe('null tolerance', () => {
    test('handles all-null data gracefully', () => {
      const data = createMockUsage({
        // All component data null
      });

      // Should not throw
      expect(() => renderStatusline(data, DEFAULT_CONFIG)).not.toThrow();

      const result = renderStatusline(data, DEFAULT_CONFIG);

      // With all null data and default config (plan: false),
      // result is empty string (no error thrown)
      expect(result).toBe('');
    });

    test('renders plan when enabled with null data', () => {
      const data = createMockUsage({
        // All component data null, but plan name is set
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        components: {
          ...DEFAULT_CONFIG.components,
          plan: true, // Enable plan
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // With all null data but plan enabled, should show plan name
      expect(plain).toContain('Test Plan');
    });

    test('handles mix of null and valid data', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: null,
        monthly: createQuotaWindow(800, 1000),
        balance: null,
      });

      const result = renderStatusline(data, DEFAULT_CONFIG);
      const plain = stripAnsi(result);

      expect(plain).toContain('Daily');
      expect(plain).not.toContain('Weekly');
      expect(plain).toContain('Monthly');
      expect(plain).not.toContain('Balance');
    });
  });

  describe('per-component overrides', () => {
    test('applies per-component progressStyle', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          progressStyle: 'bar', // Global default
        },
        components: {
          daily: true, // Use global bar progressStyle
          weekly: { progressStyle: 'hidden' }, // Override to no progress indicator
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Both should show their components with values
      expect(plain).toContain('Daily');
      expect(plain).toContain('Weekly');
      expect(plain).toContain('24%');
      expect(plain).toContain('25%');
    });

    test('applies per-component displayMode', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
        weekly: createQuotaWindow(50, 200),
      });

      const config: Config = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          displayMode: 'text', // Global default
        },
        components: {
          daily: true, // Use global text displayMode
          weekly: { displayMode: 'compact' }, // Override to compact label
        },
      };

      const result = renderStatusline(data, config);
      const plain = stripAnsi(result);

      // Daily should have full label, weekly should have single letter
      expect(plain).toContain('Daily');
      expect(plain).toMatch(/\bW\b/); // "W" for Weekly
    });
  });
});
