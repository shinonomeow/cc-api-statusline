# cc-api-statusline

> Claude Code statusline widget for monitoring API usage from third-party proxy backends

A high-performance TUI statusline tool that polls API usage data from Claude API proxy services (sub2api, claude-relay-service, or custom providers) and renders a configurable one-line status display.

## Features

- ⚡ **Fast piped mode** — <25ms warm cache, <100ms p95
- 🎨 **Highly configurable** — Layouts, colors, bar styles, display modes
- 🔌 **Provider autodetection** — Works with sub2api, claude-relay-service, custom providers
- 💾 **Smart caching** — Disk cache with atomic writes, TTL validation
- 🎯 **Claude Code integration** — Auto-setup with `--install` command
- 📊 **Multiple components** — Daily/weekly/monthly quotas, balance, tokens, rate limits
- 🐛 **Debug logging** — Detailed execution logs for troubleshooting

## Installation

```bash
# Using npm
npm install -g cc-api-statusline

# Using bun
bun add -g cc-api-statusline

# From source
git clone https://github.com/liafonx/cc-api-statusline
cd cc-api-statusline
bun install
bun run build
```

## Quick Start

### Claude Code Integration (Recommended)

The easiest way to use cc-api-statusline is with auto-setup:

```bash
# Set required environment variables first
export ANTHROPIC_BASE_URL="https://your-proxy.example.com"
export ANTHROPIC_AUTH_TOKEN="your-api-token"

# Install as Claude Code statusline widget
npx cc-api-statusline --install

# Or with bunx (auto-detects if available)
bunx cc-api-statusline --install --runner bunx

# Uninstall
npx cc-api-statusline --uninstall
```

This automatically adds to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

### Standalone Mode

```bash
# Set required environment variables
export ANTHROPIC_BASE_URL="https://your-proxy.example.com"
export ANTHROPIC_AUTH_TOKEN="your-api-token"

# Run once and exit
cc-api-statusline --once

# Run with custom config
cc-api-statusline --config ./my-config.json
```

### ccstatusline Custom Command (Legacy)

Add to your `~/.claude/ccstatusline/config.json`:

```json
{
  "customCommands": {
    "usage": {
      "command": "cc-api-statusline",
      "description": "API usage statusline",
      "type": "piped"
    }
  },
  "widgets": [
    {
      "type": "customCommand",
      "command": "usage",
      "refreshIntervalMs": 30000,
      "maxWidth": 80,
      "preserveColors": true
    }
  ]
}
```

## Configuration

Configuration file: `~/.claude/cc-api-statusline/config.json`

### User-Agent Spoofing (Optional)

Some API providers restrict requests to only come from Claude Code clients. Enable User-Agent spoofing to bypass these restrictions:

```json
{
  "spoofClaudeCodeUA": true
}
```

**Options:**
- `false` / `undefined` — No User-Agent header (default)
- `true` — Auto-detect Claude Code version, fallback to `claude-cli/2.1.56 (external, cli)`
- `"string"` — Use custom User-Agent string

**Per-provider override (custom providers only):**

```json
{
  "spoofClaudeCodeUA": true,
  "customProviders": {
    "my-provider": {
      "spoofClaudeCodeUA": "custom-client/1.0.0"
    }
  }
}
```

### Example Configuration

```json
{
  "display": {
    "layout": "standard",
    "displayMode": "bar",
    "barSize": "medium",
    "barStyle": "classic",
    "separator": " | ",
    "maxWidth": 80,
    "clockFormat": "24h"
  },
  "components": {
    "daily": true,
    "weekly": true,
    "monthly": true,
    "balance": true,
    "tokens": false,
    "rateLimit": false,
    "plan": false
  },
  "colors": {
    "auto": {
      "low": "green",
      "medium": "yellow",
      "high": "red",
      "lowThreshold": 50,
      "highThreshold": 80
    }
  },
  "pollIntervalSeconds": 30,
  "pipedRequestTimeoutMs": 800
}
```

### Display Options

#### Layouts

- `standard` — Full labels (e.g., "Daily 24%")
- `compact` — Single-letter labels (e.g., "D 24%")
- `minimal` — No labels (e.g., "24%")
- `percent-first` — Percentage before bar (e.g., "Daily 24% ━━──")

#### Display Modes

- `bar` — Progress bar visualization
- `percentage` — Percentage only (no bar)
- `icon-pct` — Nerd-font icon + percentage

#### Bar Styles

- `classic` — `━━━━────` (default)
- `block` — `████░░░░`
- `shade` — `▓▓▓▓░░░░`
- `pipe` — `||||····`
- `dot` — `●●●●○○○○`
- `braille` — `⣿⣿⣿⣿⠀⠀⠀⠀` (smooth gradients)
- `square` — `■■■■□□□□`
- `star` — `★★★★☆☆☆☆`
- Custom — `{"fill": "▰", "empty": "▱"}`

#### Bar Sizes

- `small` — 4 chars
- `small-medium` — 6 chars
- `medium` — 8 chars (default)
- `medium-large` — 10 chars
- `large` — 12 chars

### Per-Component Configuration

Override global settings per component:

```json
{
  "components": {
    "daily": {
      "barStyle": "dot",
      "color": "chill",
      "countdown": {
        "format": "duration",
        "divider": " · ",
        "prefix": "⏱ "
      }
    },
    "weekly": {
      "layout": "compact",
      "displayMode": "icon-pct"
    },
    "balance": {
      "label": "Credits"
    }
  }
}
```

**Note:** Countdown divider defaults to ` · ` (space-dot-space) for clean spacing.

### Color Configuration

#### Named Colors

`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `dim`, `bright-red`, `bright-green`, etc.

#### Hex Colors

```json
{
  "components": {
    "daily": {
      "color": "#00ff00"
    }
  }
}
```

#### Dynamic Color Aliases

```json
{
  "colors": {
    "auto": {
      "low": "green",
      "medium": "yellow",
      "high": "red",
      "lowThreshold": 50,
      "highThreshold": 80
    },
    "chill": {
      "low": "cyan",
      "medium": "blue",
      "high": "magenta",
      "lowThreshold": 60,
      "highThreshold": 90
    }
  }
}
```

#### Per-Part Coloring

```json
{
  "components": {
    "daily": {
      "colors": {
        "label": "#8a8a8a",
        "bar": "auto",
        "value": "white",
        "countdown": "#666666"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_BASE_URL` | Yes | API endpoint (e.g., `https://api.sub2api.com`) |
| `ANTHROPIC_AUTH_TOKEN` | Yes | API key or token |
| `CC_STATUSLINE_PROVIDER` | No | Override provider detection (`sub2api`, `claude-relay-service`, or custom) |
| `CC_STATUSLINE_POLL` | No | Override poll interval (seconds, min 5) |
| `CC_STATUSLINE_TIMEOUT` | No | Piped mode timeout (milliseconds, default 1000) |
| `DEBUG` or `CC_STATUSLINE_DEBUG` | No | Enable debug logging to `~/.claude/cc-api-statusline/debug.log` |

## Provider Setup

### sub2api

```bash
export ANTHROPIC_BASE_URL="https://api.sub2api.com"
export ANTHROPIC_AUTH_TOKEN="sk-sub2api-..."
```

### claude-relay-service

```bash
export ANTHROPIC_BASE_URL="https://relay.example.com"
export ANTHROPIC_AUTH_TOKEN="your-relay-token"
```

### Custom Providers

Define custom providers in config.json:

```json
{
  "customProviders": {
    "my-provider": {
      "urlPatterns": ["my-proxy.example.com"],
      "endpoint": "/api/usage",
      "method": "GET",
      "authMode": "bearer",
      "responseMapping": {
        "billingMode": "$.mode",
        "daily.used": "$.usage.daily",
        "daily.limit": "$.limits.daily"
      }
    }
  }
}
```

## CLI Usage

```bash
# Show help
cc-api-statusline --help

# Show version
cc-api-statusline --version

# Fetch once and exit
cc-api-statusline --once

# Use custom config file
cc-api-statusline --config /path/to/config.json

# Install as Claude Code statusline widget
cc-api-statusline --install
cc-api-statusline --install --runner bunx
cc-api-statusline --install --force  # Overwrite existing

# Uninstall from Claude Code
cc-api-statusline --uninstall
```

## Debug Logging

Enable detailed execution logs for troubleshooting:

```bash
# Enable debug logging
DEBUG=1 cc-api-statusline --once

# For Claude Code widget, add to settings.json:
{
  "statusLine": {
    "type": "command",
    "command": "DEBUG=1 bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}

# View logs in real-time
tail -f ~/.claude/cc-api-statusline/debug.log

# View recent logs
tail -20 ~/.claude/cc-api-statusline/debug.log

# Search for errors
grep "ERROR" ~/.claude/cc-api-statusline/debug.log
```

Debug logs include:
- Execution start/finish timestamps
- Mode detection (piped vs TTY)
- Environment variables (sanitized)
- Config and cache status
- Execution paths taken (A/B/C/D)
- Fetch timing and performance metrics
- Cache operations
- Error details with fallback behavior

## Performance

Piped mode performance targets (1000ms timeout):

- **Path A (warm cache)**: ≤25ms (p95 ≤100ms)
- **Path B (re-render)**: ≤55ms (p95 ≤100ms)
- **Path C (fetch)**: ≤840ms worst case
- **Path D (fallback)**: ≤25ms

Cache validation:
- TTL check
- Provider match
- Base URL match
- Version match
- Token hash match

Exit code behavior:
- Returns `0` when stale cache is shown with error indicators (output is still useful)
- Returns `1` only when no data can be shown (prevents confusing `[Exit: 1]` in widgets)

## Troubleshooting

### "Missing required environment variable"

Set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`:

```bash
export ANTHROPIC_BASE_URL="https://your-proxy.example.com"
export ANTHROPIC_AUTH_TOKEN="your-token"
```

Or add to `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-proxy.example.com",
    "ANTHROPIC_AUTH_TOKEN": "your-token"
  }
}
```

### "Unknown provider"

Provider autodetection failed. Explicitly set provider:

```bash
export CC_STATUSLINE_PROVIDER="sub2api"
```

Or define a custom provider in config.json.

### "[offline]" or "[stale]" indicator

Network error or cache staleness. Enable debug logging to investigate:

```bash
DEBUG=1 cc-api-statusline --once
tail -f ~/.claude/cc-api-statusline/debug.log
```

Check:
- Network connectivity to `ANTHROPIC_BASE_URL`
- API endpoint is responding
- Token is valid and not expired

### Slow performance in piped mode

Check cache validity:
- Run `cc-api-statusline --once` standalone to warm cache
- Verify `~/.claude/cc-api-statusline/cache-*.json` exists
- Check `pipedRequestTimeoutMs` config (default 800ms)
- Enable debug logging to see fetch timing

### Widget shows `[Exit: 1]` in Claude Code

This indicates the statusline command failed. Enable debug logging:

```json
{
  "statusLine": {
    "type": "command",
    "command": "DEBUG=1 bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

Then check logs: `tail -f ~/.claude/cc-api-statusline/debug.log`

## Development

```bash
# Install dependencies
bun install

# Quick dev fetch (--once mode)
bun run start

# Simulate piped mode
bun run example

# Run tests
bun test

# Lint
bun run lint

# Build
bun run build

# Run all checks
bun run check
```

## Architecture

```
┌─────────────┐
│   main.ts   │ ← Entry point, CLI orchestration, install/uninstall
└──────┬──────┘
       │
       ├──────────────────────────────────────┐
       │                                      │
┌──────▼────────┐                   ┌────────▼────────┐
│   services/   │                   │   providers/    │
│  - env        │                   │  - sub2api      │
│  - cache      │                   │  - relay        │
│  - config     │                   │  - custom       │
│  - settings   │ ← settings.json   │  - autodetect   │
│  - logger     │ ← debug logging   └────────┬────────┘
└──────┬────────┘                            │
       │                                      │
       ├──────────────────────────────────────┘
       │
┌──────▼────────┐
│ execute-cycle │ ← Unified execution (Path A/B/C/D)
└──────┬────────┘
       │
┌──────▼────────┐
│   renderer/   │
│  - component  │ ← Per-component rendering
│  - bar        │ ← Progress bars
│  - colors     │ ← ANSI color system
│  - countdown  │ ← Time-to-reset
│  - error      │ ← Error states
│  - icons      │ ← Nerd-font glyphs
│  - truncate   │ ← Terminal width
│  - index      │ ← Main pipeline
└───────────────┘
```

## Testing

- **356 tests** across **21 test files**
- Unit tests for all services and renderers
- Core execution path tests (A/B/C/D)
- E2E smoke tests with isolated environments
- Performance tests (p95 < 600ms verification)
- CI/CD via GitHub Actions

Run: `bun run check`

## License

MIT

## Links

- [Implementation Handbook](docs/implementation-handbook.md)
- [Current Implementation](docs/current-implementation.md)
- [TUI Style Spec](docs/spec-tui-style.md)
- [API Polling Spec](docs/spec-api-polling.md)
- [Custom Providers Spec](docs/spec-custom-providers.md)
- [AGENTS.md](AGENTS.md) - Development handoff guide
