# cc-api-statusline

> Claude Code statusline widget for monitoring API usage from third-party proxy backends

A high-performance TUI statusline tool that polls API usage data from Claude API proxy services (sub2api, claude-relay-service, or custom providers) and renders a configurable one-line status display.

## Features

- ⚡ **Fast piped mode** — <25ms warm cache, <100ms p95
- 🎨 **Highly configurable** — Layouts, colors, bar styles, display modes
- 🔌 **Provider autodetection** — Works with sub2api, claude-relay-service, custom providers
- 💾 **Smart caching** — Disk cache with atomic writes, TTL validation
- 🎯 **ccstatusline integration** — Drop-in Custom Command widget
- 📊 **Multiple components** — Daily/weekly/monthly quotas, balance, tokens, rate limits

## Installation

```bash
# Using npm
npm install -g cc-api-statusline

# Using bun
bun add -g cc-api-statusline

# From source
git clone https://github.com/anthropics/cc-api-statusline
cd cc-api-statusline
bun install
bun run build
```

## Quick Start

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

### ccstatusline Integration

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
```

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

Network error or cache staleness. Check:
- Network connectivity to `ANTHROPIC_BASE_URL`
- API endpoint is responding
- Token is valid and not expired

### Slow performance in piped mode

Check cache validity:
- Run `cc-api-statusline --once` standalone to warm cache
- Verify `~/.claude/cc-api-statusline/cache-*.json` exists
- Check `pipedRequestTimeoutMs` config (default 800ms)

### ANSI codes visible in output

If using ccstatusline, set `preserveColors: true` in widget config:

```json
{
  "widgets": [
    {
      "type": "customCommand",
      "command": "usage",
      "preserveColors": true
    }
  ]
}
```

## Development

```bash
# Install dependencies
bun install

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
│   main.ts   │ ← Entry point, CLI orchestration
└──────┬──────┘
       │
       ├──────────────────────────────────────┐
       │                                      │
┌──────▼────────┐                   ┌────────▼────────┐
│   services/   │                   │   providers/    │
│  - env        │                   │  - sub2api      │
│  - cache      │                   │  - relay        │
│  - config     │                   │  - custom       │
│  - polling    │                   │  - autodetect   │
└──────┬────────┘                   └────────┬────────┘
       │                                      │
       ├──────────────────────────────────────┘
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

## License

MIT

## Links

- [Implementation Handbook](docs/implementation-handbook.md)
- [TUI Style Spec](docs/spec-tui-style.md)
- [API Polling Spec](docs/spec-api-polling.md)
- [Custom Providers Spec](docs/spec-custom-providers.md)
