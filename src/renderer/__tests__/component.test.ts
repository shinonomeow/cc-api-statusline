/**
 * Tests for per-component rendering
 */

import { describe, test, expect } from 'vitest';
import { renderComponent } from '../component.js';
import { stripAnsi } from '../colors.js';
import type { NormalizedUsage, QuotaWindow, BalanceInfo, TokenStats, RateLimitWindow } from '../../types/normalized-usage.js';
import { DEFAULT_CONFIG, type ComponentConfig } from '../../types/config.js';

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

function createQuotaWindow(used: number, limit: number | null, resetsAt?: string): QuotaWindow {
  return {
    used,
    limit,
    remaining: limit !== null ? Math.max(0, limit - used) : null,
    resetsAt: resetsAt ?? new Date(Date.now() + 3600000).toISOString(),
  };
}

describe('renderComponent - quota components', () => {
  describe('standard layout + bar mode', () => {
    test('renders daily component with bar', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(24, 100),
      });
      const result = renderComponent('daily', data, {}, DEFAULT_CONFIG);
      expect(result).toBeTruthy();
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('Daily');
      expect(plain).toContain('24%');
    });

    test('renders weekly component with bar', () => {
      const data = createMockUsage({
        weekly: createQuotaWindow(50, 200),
      });
      const result = renderComponent('weekly', data, {}, DEFAULT_CONFIG);
      expect(result).toBeTruthy();
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('Weekly');
      expect(plain).toContain('25%');
    });

    test('renders monthly component with bar', () => {
      const data = createMockUsage({
        monthly: createQuotaWindow(800, 1000),
      });
      const result = renderComponent('monthly', data, {}, DEFAULT_CONFIG);
      expect(result).toBeTruthy();
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('Monthly');
      expect(plain).toContain('80%');
    });
  });

  describe('compact displayMode', () => {
    test('uses single letter labels', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = { displayMode: 'compact' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).toMatch(/^D /);
    });
  });

  describe('hidden displayMode', () => {
    test('hides labels', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = { displayMode: 'hidden' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).not.toContain('Daily');
      expect(plain).not.toContain('D');
      expect(plain).toContain('50%'); // Value still shown
    });
  });

  describe('percent-first layout', () => {
    test('shows percentage before bar', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      // Explicitly use bar progressStyle + classic style for deterministic char check
      const config: ComponentConfig = { layout: 'percent-first', progressStyle: 'bar', barStyle: 'classic' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      // Percentage should appear before bar characters
      const percentIndex = plain.indexOf('50%');
      const barIndex = plain.indexOf('━');
      expect(percentIndex).toBeGreaterThan(-1);
      expect(barIndex).toBeGreaterThan(percentIndex);
    });
  });

  describe('progress styles', () => {
    test('bar progressStyle (classic) renders progress bar', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      // Explicitly use classic style for ━ char assertion
      const config: ComponentConfig = { progressStyle: 'bar', barStyle: 'classic' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('━'); // Bar character
    });

    test('bar progressStyle (block, default) renders progress bar', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = { progressStyle: 'bar' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('█'); // Block bar character (default barStyle)
    });

    test('hidden progressStyle skips bar', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = { progressStyle: 'hidden' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).not.toContain('━');
      expect(plain).toContain('50%');
    });

    test('icon progressStyle renders nerd font icon', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = { progressStyle: 'icon' };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      expect(result).toBeTruthy();
      // Icon should be present (Unicode progress circle)
      expect(result).toMatch(/[\u{F0130}-\u{F0AA5}]/u);
    });
  });

  describe('renderComponent - icon color', () => {
    const renderContext = { colorMode: 'truecolor' as const, nerdFontAvailable: true, isPiped: false };

    test('icon at low usage gets color applied', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(10, 100), // 10% usage
      });
      const config: ComponentConfig = {
        progressStyle: 'icon',
        colors: { bar: '#4ADE80' } // explicit hex color
      };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG, renderContext);
      expect(result).toBeTruthy();
      // Should have ANSI color codes around icon
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[38;2;74;222;128m/); // #4ADE80 = rgb(74, 222, 128)
    });

    test('icon at high usage gets high-usage color', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(95, 100), // 95% usage
      });
      const config: ComponentConfig = {
        progressStyle: 'icon',
        colors: { bar: '#F87171' } // explicit hex color for high usage
      };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG, renderContext);
      expect(result).toBeTruthy();
      // Should have ANSI color codes (critical tier color)
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[38;2;248;113;113m/); // #F87171 = rgb(248, 113, 113)
    });

    test('icon with explicit hex color gets truecolor ANSI', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100),
      });
      const config: ComponentConfig = {
        progressStyle: 'icon',
        colors: { bar: '#FF5500' }
      };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG, renderContext);
      expect(result).toBeTruthy();
      // Should have specific hex color as truecolor ANSI
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[38;2;255;85;0m/); // #FF5500 = rgb(255, 85, 0)
    });
  });

  describe('null handling', () => {
    test('returns null for missing daily data', () => {
      const data = createMockUsage({ daily: null });
      const result = renderComponent('daily', data, {}, DEFAULT_CONFIG);
      expect(result).toBeNull();
    });

    test('handles null limit (unlimited) - hidden at provider level', () => {
      // Note: Provider-level createQuotaWindow() now returns null for unlimited quotas,
      // so this tests the renderer's behavior when it receives null data
      const data = createMockUsage({
        daily: null, // unlimited quota is hidden at provider level
      });
      const result = renderComponent('daily', data, {}, DEFAULT_CONFIG);
      expect(result).toBeNull(); // Component is hidden
    });
  });

  describe('countdown rendering', () => {
    test('includes countdown by default', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100, new Date(Date.now() + 3600000).toISOString()),
      });
      const result = renderComponent('daily', data, {}, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      // Should contain countdown divider
      expect(plain).toMatch(/ · /);
    });

    test('hides countdown when disabled', () => {
      const data = createMockUsage({
        daily: createQuotaWindow(50, 100, new Date(Date.now() + 3600000).toISOString()),
      });
      const config: ComponentConfig = { countdown: false };
      const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      expect(plain).not.toMatch(/ · /);
    });
  });

  describe('cost fallback (when resetsAt is null)', () => {
    test('shows cost fallback when resetsAt is null but limit is available', () => {
      const data = createMockUsage({
        weekly: {
          used: 156,
          limit: 275,
          remaining: 119,
          resetsAt: null, // No reset time (sub2api weekly/monthly)
        },
      });
      const result = renderComponent('weekly', data, {}, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      // Should show cost instead of time countdown
      expect(plain).toContain('$156/$275');
      expect(plain).toContain(' · '); // Still uses divider
    });

    test('cost display takes priority over time countdown', () => {
      const resetsAt = new Date(Date.now() + 3600000).toISOString();
      const data = createMockUsage({
        weekly: {
          used: 156,
          limit: 275,
          remaining: 119,
          resetsAt, // Has reset time
        },
      });
      const result = renderComponent('weekly', data, {}, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      // Should show cost display, not time countdown (new priority)
      expect(plain).toContain('$156/$275');
      expect(plain).toMatch(/ · /); // Has divider
    });

    test('hides secondary display when countdown disabled (even with cost data)', () => {
      const data = createMockUsage({
        weekly: {
          used: 156,
          limit: 275,
          remaining: 119,
          resetsAt: null,
        },
      });
      const config: ComponentConfig = { countdown: false };
      const result = renderComponent('weekly', data, config, DEFAULT_CONFIG);
      const plain = stripAnsi(result ?? '');
      // Should not show cost or divider
      expect(plain).not.toContain('$156/$275');
      expect(plain).not.toMatch(/ · /);
    });

    test('returns empty string for secondary display when both resetsAt and limit are null', () => {
      const data = createMockUsage({
        monthly: {
          used: 500,
          limit: null, // No limit
          remaining: null,
          resetsAt: null, // No reset time
        },
      });
      const result = renderComponent('monthly', data, {}, DEFAULT_CONFIG);
      // Component should still render (has data), but no secondary display
      const plain = stripAnsi(result ?? '');
      expect(plain).toContain('Monthly');
      expect(plain).not.toMatch(/ · /);
    });
  });
});

describe('renderComponent - balance', () => {
  test('renders balance with currency', () => {
    const balance: BalanceInfo = {
      remaining: 42.5,
      initial: 100,
      unit: 'USD',
    };
    const data = createMockUsage({ balance });
    const result = renderComponent('balance', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Balance');
    expect(plain).toContain('$42.50');
  });

  test('renders unlimited balance as ∞', () => {
    const balance: BalanceInfo = {
      remaining: -1, // unlimited
      initial: null,
      unit: 'USD',
    };
    const data = createMockUsage({ balance });
    const result = renderComponent('balance', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('∞');
  });

  test('skips bar for unlimited balance', () => {
    const balance: BalanceInfo = {
      remaining: -1,
      initial: null,
      unit: 'USD',
    };
    const data = createMockUsage({ balance });
    const result = renderComponent('balance', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('━'); // No bar
  });

  test('returns null for missing balance', () => {
    const data = createMockUsage({ balance: null });
    const result = renderComponent('balance', data, {}, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });
});

describe('renderComponent - tokens', () => {
  test('renders token stats', () => {
    const tokenStats: TokenStats = {
      today: null,
      total: {
        requests: 1000,
        inputTokens: 50000,
        outputTokens: 25000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 75000,
        cost: 10.5,
      },
      rpm: null,
      tpm: null,
    };
    const data = createMockUsage({ tokenStats });
    const result = renderComponent('tokens', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Tokens');
    expect(plain).toContain('75K'); // Formatted with K suffix (no decimal for >= 10K)
  });

  test('formats large token counts', () => {
    const tokenStats: TokenStats = {
      today: null,
      total: {
        requests: 1000,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1500000, // 1.5M
        cost: 0,
      },
      rpm: null,
      tpm: null,
    };
    const data = createMockUsage({ tokenStats });
    const result = renderComponent('tokens', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('1.5M');
  });

  test('returns null for missing token stats', () => {
    const data = createMockUsage({ tokenStats: null });
    const result = renderComponent('tokens', data, {}, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });
});

describe('renderComponent - rateLimit', () => {
  test('renders rate limit with usage', () => {
    const rateLimit: RateLimitWindow = {
      windowSeconds: 60,
      requestsUsed: 45,
      requestsLimit: 100,
      costUsed: 0.5,
      costLimit: 1.0,
      remainingSeconds: 30,
    };
    const data = createMockUsage({ rateLimit });
    const result = renderComponent('rateLimit', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Rate');
    expect(plain).toContain('45/100');
  });

  test('returns null for missing rate limit', () => {
    const data = createMockUsage({ rateLimit: null });
    const result = renderComponent('rateLimit', data, {}, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });
});

describe('renderComponent - plan', () => {
  test('renders plan name', () => {
    const data = createMockUsage({ planName: 'Pro Plan' });
    const result = renderComponent('plan', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Pro Plan');
  });

  test('hides plan in hidden displayMode', () => {
    const data = createMockUsage({ planName: 'Pro Plan' });
    const config: ComponentConfig = { displayMode: 'hidden' };
    const result = renderComponent('plan', data, config, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });
});

describe('renderComponent - custom labels', () => {
  test('uses custom string label', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const config: ComponentConfig = { label: 'Today' };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Today');
    expect(plain).not.toContain('Daily');
  });

  test('uses custom object label text in text mode', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const config: ComponentConfig = { label: { text: 'Today', emoji: '📅' }, progressStyle: 'bar' };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Today');
  });

  test('uses custom emoji label in emoji mode', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    // emoji mode uses label.emoji, not label.text
    const config: ComponentConfig = { label: { text: 'Today', emoji: '🌟' }, displayMode: 'emoji' };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('🌟');
    expect(plain).not.toContain('Today');
  });

  test('hides label when label: false', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const config: ComponentConfig = { label: false };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('Daily');
    expect(plain).not.toContain('D');
  });
});

describe('renderComponent - per-part coloring', () => {
  test('applies per-part colors', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const config: ComponentConfig = {
      colors: {
        label: '#8a8a8a',
        bar: 'red',
        value: 'white',
        countdown: '#666666',
      },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    expect(result).toBeTruthy();
    // Should contain ANSI color codes
    expect(result).toContain('\x1b[');
  });

  test('per-part colors override component color', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const config: ComponentConfig = {
      color: 'auto', // Would normally resolve dynamically
      colors: {
        value: 'cyan', // Override with fixed color
      },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    expect(result).toBeTruthy();
    expect(result).toContain('\x1b[36m'); // Cyan ANSI code
  });

  test('per-part colors support alias resolution', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(90, 100), // 90% usage
    });
    const config: ComponentConfig = {
      colors: {
        bar: 'auto', // Should resolve to 'critical' theme color at 90%
      },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    expect(result).toBeTruthy();
    // Should contain critical color (5th tier: #D45A5A = rgb(212, 90, 90))
    expect(result).toContain('\x1b[38;2;212;90;90m'); // Truecolor ANSI for critical
  });
});

describe('renderComponent - label display modes', () => {
  test('text mode uses full label text', () => {
    const data = createMockUsage({ daily: createQuotaWindow(50, 100) });
    const result = renderComponent('daily', data, { displayMode: 'text' }, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Daily');
  });

  test('compact mode uses single-char label', () => {
    const data = createMockUsage({ daily: createQuotaWindow(50, 100) });
    const result = renderComponent('daily', data, { displayMode: 'compact' }, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toMatch(/^D /);
    expect(plain).not.toContain('Daily');
  });

  test('emoji mode uses emoji label', () => {
    const data = createMockUsage({ daily: createQuotaWindow(50, 100) });
    const result = renderComponent('daily', data, { displayMode: 'emoji' }, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('📅'); // Default calendar emoji
    expect(plain).not.toContain('Daily');
  });

  test('custom emoji overrides default in emoji mode', () => {
    const data = createMockUsage({ daily: createQuotaWindow(50, 100) });
    const config: ComponentConfig = { displayMode: 'emoji', label: { emoji: '🌟' } };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('🌟');
    expect(plain).not.toContain('📅');
  });

  test('hidden mode shows no label but still shows value', () => {
    const data = createMockUsage({ daily: createQuotaWindow(50, 100) });
    const result = renderComponent('daily', data, { displayMode: 'hidden' }, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('Daily');
    expect(plain).not.toContain('D');
    expect(plain).toContain('50%');
  });
});

describe('renderComponent - divider spacing (bug fix)', () => {
  test('tight divider "·" produces no space before divider', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(48, 100),
    });
    const config: ComponentConfig = {
      progressStyle: 'hidden',
      countdown: { divider: '·' },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    // "Daily 48%·$48/$100" — no space between 48% and ·
    expect(plain).not.toMatch(/% ·/);
    expect(plain).toMatch(/48%·/);
  });

  test('spaced divider " · " produces single space each side', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(48, 100),
    });
    const config: ComponentConfig = {
      progressStyle: 'hidden',
      countdown: { divider: ' · ' },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    // "Daily 48% · $48/$100" — single space each side
    expect(plain).toContain('48% · $48/$100');
    expect(plain).not.toContain('  ·');
  });

  test('default divider " · " does not produce double-space', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    const result = renderComponent('daily', data, { progressStyle: 'hidden' }, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('  ·');
    expect(plain).toContain(' · ');
  });
});

describe('renderComponent - percentage: false', () => {
  test('hides percentage when percentage: false', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(48, 100),
    });
    const config: ComponentConfig = { percentage: false, progressStyle: 'hidden', countdown: false };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('%');
    expect(plain).toContain('Daily');
  });

  test('percentage: false + hidden progress + tight divider → countdown appended to label', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(23, 50),
    });
    const config: ComponentConfig = {
      percentage: false,
      progressStyle: 'hidden',
      countdown: { divider: '·' },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('%');
    expect(plain).toMatch(/Daily·/);
  });

  test('percentage: false + hidden progress → countdown appended to label', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(23, 50),
    });
    const config: ComponentConfig = {
      percentage: false,
      progressStyle: 'hidden',
      countdown: { divider: ' · ' },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('%');
    expect(plain).toContain('Daily · $23/$50');
  });

  test('percentage: false + bar progress → countdown appended to bar', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(23, 50),
    });
    const config: ComponentConfig = {
      percentage: false,
      progressStyle: 'bar',
      barStyle: 'classic',
      countdown: { divider: '·' },
    };
    const result = renderComponent('daily', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('%');
    expect(plain).toContain('Daily');
    expect(plain).toMatch(/━.*·\$23\/\$50/);
  });
});

describe('renderComponent - qualifier labels (Plan B)', () => {
  test('renders qualifier in standard layout: "Weekly(Opus)"', () => {
    const data = createMockUsage({
      weekly: { used: 20, limit: 50, remaining: 30, resetsAt: null, qualifier: 'Opus' },
    });
    const result = renderComponent('weekly', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Weekly(Opus)');
  });

  test('renders qualifier in compact displayMode: "W(O)"', () => {
    const data = createMockUsage({
      weekly: { used: 20, limit: 50, remaining: 30, resetsAt: null, qualifier: 'Opus' },
    });
    const config: ComponentConfig = { displayMode: 'compact' };
    const result = renderComponent('weekly', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('W(O)');
  });

  test('renders no qualifier label in hidden displayMode', () => {
    const data = createMockUsage({
      weekly: { used: 20, limit: 50, remaining: 30, resetsAt: null, qualifier: 'Opus' },
    });
    const config: ComponentConfig = { displayMode: 'hidden' };
    const result = renderComponent('weekly', data, config, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).not.toContain('Opus');
    expect(plain).not.toContain('Weekly');
  });

  test('renders normally without qualifier', () => {
    const data = createMockUsage({
      weekly: { used: 20, limit: 50, remaining: 30, resetsAt: null },
    });
    const result = renderComponent('weekly', data, {}, DEFAULT_CONFIG);
    const plain = stripAnsi(result ?? '');
    expect(plain).toContain('Weekly');
    expect(plain).not.toContain('(');
  });

  test('nerd font fallback: uses bar when nerd fonts unavailable', () => {
    const data = createMockUsage({
      daily: createQuotaWindow(50, 100),
    });
    // RenderContext with nerdFontAvailable: false
    const renderContext = { colorMode: 'truecolor' as const, nerdFontAvailable: false, isPiped: true };
    const result = renderComponent('daily', data, { progressStyle: 'icon' }, DEFAULT_CONFIG, renderContext);
    const plain = stripAnsi(result ?? '');
    // Should fall back to bar mode, so no nerd font icons
    expect(plain).not.toMatch(/[\u{F0130}-\u{F0AA5}]/u);
  });
});
