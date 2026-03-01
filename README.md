# cc-api-statusline

English | [简体中文](README.zh-CN.md)

A high-performance TUI statusline tool that polls API usage data from Claude API proxy services (sub2api, claude-relay-service, or custom providers) and renders a configurable one-line status display.

## Features

- 🎨 **Highly configurable** — Layouts, colors, bar styles, display modes
- 🔌 **Provider autodetection** — Works with sub2api, claude-relay-service, custom providers
- 📊 **Multiple components** — Daily/weekly/monthly quotas, balance, tokens, rate limits
- 🔁 **Hot switching** — Auto-detects API endpoint and credential changes at runtime
- 🔒 **Reliability** — No stale data display, race-condition-free writes, auto cache cleanup

## Quick Start

### 1. Set up your API endpoint

You need `ANTHROPIC_BASE_URL` (your proxy URL) and `ANTHROPIC_AUTH_TOKEN` (your API key).

**Recommended: via `~/.claude/settings.json` env overlay** (automatically passed to the widget):

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-proxy.example.com",
    "ANTHROPIC_AUTH_TOKEN": "your-api-token"
  }
}
```

Or export them in your shell:

```bash
export ANTHROPIC_BASE_URL="https://your-proxy.example.com"
export ANTHROPIC_AUTH_TOKEN="your-api-token"
```

### 2. Preview

```bash
bunx cc-api-statusline@latest --once
```

### 3. Install as Claude Code widget (optional)

```bash
bunx cc-api-statusline@latest --install
```

This adds to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

Using `bunx` ensures you always run the latest version without a global install. To uninstall:

```bash
bunx cc-api-statusline --uninstall
```

Optional global install:

```bash
bun add -g cc-api-statusline
# or
npm install -g cc-api-statusline
```

## Hot Switching

cc-api-statusline automatically detects when `ANTHROPIC_BASE_URL` or `ANTHROPIC_AUTH_TOKEN` changes (e.g. when you switch Claude Code profiles or rotate tokens). On detection it shows a brief transition indicator (`⟳ Switching provider...`) and refreshes from the new endpoint — no restart required.

## Configuration

### Style Config (`~/.claude/cc-api-statusline/config.json`)

```json
{
  "display": {
    "layout": "standard",
    "displayMode": "text",
    "progressStyle": "icon",
    "barStyle": "block",
    "divider": { "text": "|", "margin": 1, "color": "#555753" },
    "maxWidth": 100
  },
  "components": {
    "daily": true,
    "weekly": true,
    "monthly": true,
    "balance": true,
    "tokens": false,
    "rateLimit": false
  }
}
```

Key options:

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `layout` | `standard` / `percent-first` | `standard` | Assembly order of label, bar, value |
| `displayMode` | `text` / `compact` / `emoji` / `nerd` / `hidden` | `text` | Label style. `nerd` requires a [Nerd Font](https://www.nerdfonts.com/font-downloads). |
| `progressStyle` | `bar` / `icon` / `hidden` | `icon` | Usage fraction visualization. `icon` requires a [Nerd Font](https://www.nerdfonts.com/font-downloads). |
| `barStyle` | `block` / `classic` / `dot` / `shade` / `pipe` / `braille` / `square` / `star` | `block` | Bar character style |
| `barSize` | `small` / `small-medium` / `medium` / `medium-large` / `large` | `medium` | Bar width (4–12 chars) |
| `divider` | `DividerConfig` or `false` | `{ text: "\|", margin: 1, color: "#555753" }` | Separator between components; `false` disables |
| `maxWidth` | 20–100 | `100` | Max % of terminal width |

For the full style reference including per-component overrides, color aliases, and countdown config see [docs/spec-tui-style.md](docs/spec-tui-style.md).

#### User-Agent Spoofing

Some providers restrict requests to Claude Code clients. Enable to bypass:

```json
{
  "spoofClaudeCodeUA": true
}
```

- `false` / `undefined` — No User-Agent header (default)
- `true` — Auto-detect Claude Code version, fallback to `claude-cli/2.1.56 (external, cli)`
- `"string"` — Use a custom User-Agent string

### API Config (`~/.claude/cc-api-statusline/api-config/`)

Define custom providers as JSON files in this directory. After adding or modifying provider files, run:

```bash
cc-api-statusline --apply-config
```

See [docs/api-config-reference.md](docs/api-config-reference.md) for the full schema.

## [ccstatusline](https://github.com/anthropics/claude-code) Custom Command

Add to `~/.claude/ccstatusline/config.json`:

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
      "maxWidth": 100,
      "preserveColors": true
    }
  ]
}
```

## Environment Variables

All variables are optional at the shell level — `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` can be set via `settings.json` env overlay instead of shell exports (see [Quick Start](#quick-start)).

| Variable | Optional | Description |
|----------|----------|-------------|
| `ANTHROPIC_BASE_URL` | Yes | API endpoint (e.g., `https://api.sub2api.com`) |
| `ANTHROPIC_AUTH_TOKEN` | Yes | API key or token |
| `CC_STATUSLINE_PROVIDER` | Yes | Override provider detection (`sub2api`, `claude-relay-service`, or custom) |
| `CC_STATUSLINE_POLL` | Yes | Override poll interval (seconds, min 5) |
| `CC_STATUSLINE_TIMEOUT` | Yes | Piped mode timeout (milliseconds, default 5000) |
| `DEBUG` or `CC_STATUSLINE_DEBUG` | Yes | Enable debug logging to `~/.claude/cc-api-statusline/debug.log` |

## Troubleshooting

### "Missing required environment variable"

Set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` via shell exports or the `settings.json` env overlay (see [Quick Start](#quick-start)).

### "Unknown provider"

Provider autodetection failed. Explicitly set the provider:

```bash
export CC_STATUSLINE_PROVIDER="sub2api"
```

Or define a custom provider in `api-config/`.

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

```bash
# Warm the cache standalone
cc-api-statusline --once
# Check debug timing
DEBUG=1 cc-api-statusline --once
```

Verify `pipedRequestTimeoutMs` in config (default 3000ms) and check `~/.claude/cc-api-statusline/cache-*.json` exists.

### Widget shows `[Exit: 1]` in Claude Code

Enable debug logging in `~/.claude/settings.json`:

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

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run start` | Quick dev fetch (--once mode) |
| `bun run example` | Simulate piped mode |
| `bun run test` | Run tests |
| `bun run lint` | Lint |
| `bun run build` | Build |
| `bun run check` | Run all checks |

### Debug Logging

Enable detailed execution logs for troubleshooting:

```bash
# Enable debug logging
DEBUG=1 cc-api-statusline --once

# For Claude Code widget, add to settings.json:
# "command": "DEBUG=1 bunx -y cc-api-statusline@latest"

# View logs in real-time
tail -f ~/.claude/cc-api-statusline/debug.log

# Search for errors
grep "ERROR" ~/.claude/cc-api-statusline/debug.log
```

Debug logs include execution timestamps, mode detection, config/cache status, execution paths (A/B/C/D), fetch timing, and error details.

Log files are automatically rotated (1-in-20 invocations):
- `debug.log` ≥ 500 KB → archived as `debug.YYYY-MM-DDTHH-MM.log`
- Archives older than 24h → compressed with gzip
- Compressed archives older than 3 days → deleted

## Testing

- **691 tests** across **39 test files**
- Unit tests for all services, renderers, and shared utilities
- Core execution path tests (A/B/C/D)
- E2E smoke tests with isolated environments
- Performance tests (p95 < 600ms verification)
- Cache garbage collection tests
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
