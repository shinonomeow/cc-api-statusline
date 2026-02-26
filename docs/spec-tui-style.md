> Supplemental reference for renderer component behavior.
> Source of truth is `docs/implementation-handbook.md` plus `src/renderer/*`.

# TUI Style & Component Rendering — Spec

> Extracted from `implementation-handbook.md` §6. Governs how components, sub-components, and display modes work.

---

## Component Model

Each statusline is composed of **components**. Each component can contain **sub-components**.

```
StatusLine
 ├─ DailyComponent       (usage + countdown)
 ├─ WeeklyComponent      (usage + countdown)
 ├─ MonthlyComponent     (usage + countdown)
 ├─ BalanceComponent     (value only)
 ├─ TokensComponent      (value only)
 ├─ RateLimitComponent   (value only)
 └─ PlanComponent        (label only)
```

---

## Config Shape

A component accepts either a **boolean** or an **object**:

```json
{
  "components": {
    "daily":   true,
    "weekly":  { "barStyle": "dot", "color": "chill" },
    "monthly": false,
    "balance": true,
    "tokens":  false
  }
}
```

- `true` → show with all defaults
- `false` → hide
- `{ ... }` → show with overrides (unset keys inherit from `display.*` globals)
- **Order matters** — the order of keys in `components` is the **render order** left-to-right. Omitted components are appended in default order (`daily`, `weekly`, `monthly`, `balance`, `tokens`, `rateLimit`, `plan`).

---

## Global Display Defaults

Set once, inherited by all components unless overridden per-component:

```json
{
  "display": {
    "layout":      "standard",
    "displayMode": "bar",
    "barSize":     "medium",
    "barStyle":    "classic",
    "separator":   " | ",
    "maxWidth":    80,
    "clockFormat": "24h"
  }
}
```

| Key | Values | Default | Description |
|---|---|---|---|
| `layout` | `standard` / `compact` / `minimal` / `percent-first` | `standard` | Text arrangement (see below) |
| `displayMode` | `bar` / `percentage` / `icon-pct` | `bar` | How usage fraction is visualized |
| `barSize` | `small`(4) / `small-medium`(6) / `medium`(8) / `medium-large`(10) / `large`(12) | `medium` | Bar character width |
| `barStyle` | name or `{ fill, empty }` | `classic` | Bar character style (see below) |
| `separator` | string | `" \| "` | Between components |
| `maxWidth` | 20–100 | 80 | % of terminal width |
| `clockFormat` | `12h` / `24h` | `24h` | For countdown time display |

---

## Layouts

Controls how labels, bars, and values are arranged. This is the **primary** way to switch label styles — not separate label/value mode flags.

| Layout | Label style | Example |
|---|---|---|
| `standard` | Full word | `Daily ━━━━━━━━ 24%·3h12m` |
| `compact` | Single letter | `D ━━━━━━━━ 24%·3h12m` |
| `minimal` | None (raw) | `━━━━━━━━ 24%` |
| `percent-first` | Full word, % before bar | `24% ━━━━━━━━·3h12m` |

### Compact label mapping

| Component | Short label |
|---|---|
| `daily` | `D` |
| `weekly` | `W` |
| `monthly` | `M` |
| `balance` | `B` |
| `tokens` | `T` |
| `rateLimit` | `R` |

### Layout effects

- `minimal` hides all labels and the `plan` component
- `compact` replaces full labels with single letters
- `percent-first` moves the percentage before the bar
- Per-component overrides still win (see below)

---

## Display Modes

Controls how the usage fraction is visualized.

| Mode | Example |
|---|---|
| `bar` | `Daily ━━━━──── 24%` |
| `percentage` | `Daily 24%` |
| `icon-pct` | `Daily 󰪞 24%` (nerd-font progress circle) |

### `icon-pct` nerd-font icon mapping

Uses 9 progress circle glyphs from nerd-fonts:

| Codepoint | Glyph | Threshold |
|---|---|---|
| `U+F0130` | 󰄰 | 0% (empty) |
| `U+F0A9E` | 󰪞 | ≤ 12.5% |
| `U+F0A9F` | 󰪟 | ≤ 25% |
| `U+F0AA0` | 󰪠 | ≤ 37.5% |
| `U+F0AA1` | 󰪡 | ≤ 50% |
| `U+F0AA2` | 󰪢 | ≤ 62.5% |
| `U+F0AA3` | 󰪣 | ≤ 75% |
| `U+F0AA4` | 󰪤 | ≤ 87.5% |
| `U+F0AA5` | 󰪥 | ≤ 100% (full) |

Selection: `index = Math.min(8, Math.ceil(percentage / 12.5))` → pick from `[0xF0130, 0xF0A9E, ..., 0xF0AA5]`.

---

## Per-Component Overrides

Each component object can override any global default:

| Key | Type | Description |
|---|---|---|
| `layout` | string | Override global layout for this component |
| `displayMode` | string | Override global `display.displayMode` |
| `barSize` | string | Override global bar size |
| `barStyle` | string or `{fill, empty}` | Override global bar style |
| `color` | string | Color for all parts (shorthand), or alias name |
| `colors` | object | Per-part color overrides (see below) |
| `label` | string, object, or `false` | Custom label (see below) |
| `countdown` | boolean or object | Countdown sub-component (quota components only) |

### Per-component layout override

A component can use a different layout than the global one:

```json
{
  "display": { "layout": "standard" },
  "components": {
    "daily":  { "layout": "percent-first" },
    "weekly": true
  }
}
```

Output: `24% ━━━━━━━━·3h12m | Weekly ━━━━━━━━ 22%·5d3h`
(daily uses `percent-first`, weekly inherits global `standard`)

### Custom labels

The `label` key controls what appears before the bar/value:

| Value | Effect |
|---|---|
| `false` | No label shown |
| `"Usage"` | Custom text label |
| `{ "text": "Daily", "icon": "" }` | Text for `standard`/`compact`, icon for `icon` displayMode |
| `{ "icon": "🔥" }` | Icon label (text defaults to component name) |

When `label` is a string, it is used as the text label. When it's an object, you can set both `text` and `icon` variants. The layout decides which is rendered:
- `standard` / `percent-first` → uses `label.text`
- `compact` → uses first character of `label.text`
- `minimal` → no label
- If `displayMode: "icon-pct"` → `label.icon` is used if set

### Per-part coloring

The shorthand `color` key applies to all parts. For fine-grained control, use `colors`:

| `colors` key | What it colors |
|---|---|
| `label` | Label text ("Daily", "D", or icon) |
| `bar` | Bar fill characters |
| `value` | Percentage / value text |
| `countdown` | Countdown text |

Each accepts a color name, hex value, or alias:

```json
{
  "components": {
    "daily": {
      "color": "auto",
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

`colors` keys override `color`. Unset `colors` keys fall back to `color`.

### Example

```json
{
  "components": {
    "daily": {
      "barStyle": "dot",
      "color": "auto",
      "label": { "text": "Today", "icon": "" },
      "countdown": { "divider": "·" }
    },
    "weekly": {
      "layout": "compact",
      "displayMode": "percentage",
      "label": false,
      "countdown": { "prefix": "resets ", "divider": ", " }
    }
  }
}
```

---

## Bar Styles

| Style | Fill | Empty | Example |
|---|---|---|---|
| `classic` | `━` | `─` | `━━━━────` (default) |
| `block` | `█` | `░` | `████░░░░` |
| `shade` | `▓` | `░` | `▓▓▓▓░░░░` |
| `pipe` | `┃` | `┊` | `┃┃┃┃┊┊┊┊` |
| `dot` | `●` | `○` | `●●●●○○○○` |
| `braille` | (gradient) | | `⣿⣿⣷⡀` |
| `square` | `■` | `□` | `■■■■□□□□` |
| `star` | `★` | `☆` | `★★★★☆☆☆☆` |

Custom:
```json
{ "barStyle": { "fill": "▰", "empty": "▱" } }
```

### Bar empty character color

The **empty** (unfilled) portion of the bar always uses a dimmed/muted terminal color (e.g. `dim` attribute or a fixed gray like `#555`). It does **not** follow the component's dynamic fill color — this ensures visual contrast between filled and empty regardless of usage level.

---

## Countdown Sub-Component

Attached to quota components (`daily`, `weekly`, `monthly`). Shows time until that specific window resets.

### Config

Accepts `true` (show with defaults), `false` (hide), or an object:

| Key | Values | Default | Description |
|---|---|---|---|
| `divider` | string | `" · "` | Separator between usage value and countdown (space-dot-space) |
| `prefix` | string | `""` | Text before the time (e.g. `"resets "`) |
| `format` | `"auto"` / `"duration"` / `"time"` | `"auto"` | How to display the reset time |

### Divider examples

| Divider | Result |
|---|---|
| `"·"` | `24%·3h12m` |
| `", "` | `24%, resets 3h12m` |
| `" "` | `24% 3h12m` |
| `"→"` | `24%→3h12m` |

### Format rules

**`auto`** — Switches based on time remaining:
- `> 24h` → date display: `Mon 5pm` or `Feb 28`
- `≤ 24h` → duration: `3h12m`
- `< 60s` → `now`

**`duration`** — Always shows remaining time:
- `≥ 1 day` → `Xd Yh`
- `≥ 1 hour` → `XhYm`
- `< 1 hour` → `Xm`
- `< 60s` → `now`

**`time`** — Always shows wall-clock target: `Mon 5pm`, `Sat 00:00`. Respects `clockFormat`.

### Data source

| Component | Reset source |
|---|---|
| `daily` | `daily.resetsAt` |
| `weekly` | `weekly.resetsAt` |
| `monthly` | `monthly.resetsAt` |

If `resetsAt` is null → countdown hidden automatically.

---

## Dynamic Color

Bar and percentage colors change based on usage. The `color` key on a component controls this.

### Built-in: `"auto"` (default)

| Usage | Color |
|---|---|
| 0–49% | `low` color (default: green) |
| 50–79% | `mid` color (default: yellow) |
| 80–100% | `high` color (default: red) |

Global thresholds:
```json
{
  "colorThresholds": { "low": [0, 49], "mid": [50, 79], "high": [80, 100] },
  "themeColors": { "low": "green", "mid": "yellow", "high": "red" }
}
```

### Custom color aliases

Define named aliases with custom ranges:

```json
{
  "colorAliases": {
    "chill": [
      { "max": 30, "color": "blue" },
      { "max": 60, "color": "cyan" },
      { "max": 85, "color": "yellow" },
      { "max": 100, "color": "red" }
    ],
    "binary": [
      { "max": 90, "color": "green" },
      { "max": 100, "color": "red" }
    ]
  }
}
```

Use by name:
```json
{ "components": { "weekly": { "color": "chill" } } }
```

### Color value formats

All color keys accept any of these formats:

| Format | Example | Description |
|---|---|---|
| Named ANSI | `"cyan"`, `"red"`, `"green"` | Standard terminal colors |
| Hex (6-digit) | `"#ff5500"` | 24-bit truecolor |
| Hex (3-digit) | `"#f50"` | Shorthand (expanded to `#ff5500`) |
| Alias name | `"auto"`, `"chill"` | Resolved dynamically from usage % |

### Resolution

1. **Alias name** (`"auto"`, `"chill"`) → resolved dynamically at render time from component's usage %
2. **Hex or named color** (`"cyan"`, `"#ff5500"`) → used as-is, no dynamic behavior
3. **Omitted / `null`** → inherits `"auto"`

### Non-percentage components

| Component | Usage input for alias |
|---|---|
| `balance` | `remaining / initial * 100` (if known, else `low`) |
| `tokens` | Fixed color only — aliases not applicable |
| `rateLimit` | `requestsUsed / requestsLimit * 100` |

---

## Error Display

When a fetch or parse error occurs, the statusline must still render.

### Error states

| Error type | Display |
|---|---|
| **Network error** | Cached data + `[offline]` |
| **HTTP 401/403** | `⚠ Auth error` — halt polling; recovers on credential change |
| **HTTP 429** | `⚠ Rate limited` + backoff timer |
| **HTTP 500** | Cached data + `[stale]`; retry |
| **Invalid response** | Cached data + `[parse error]` |
| **No cache + error** | `⚠ {provider}: {message}` |
| **Provider unknown** | `⚠ Unknown provider` |
| **Missing env vars** | `⚠ Set ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN` |
| **Switching provider** | `⟳ Switching provider...` — transition indicator (dim) |
| **New credentials** | `⟳ New credentials, refreshing...` — transition indicator (dim) |
| **New endpoint** | `⟳ New endpoint, refreshing...` — transition indicator (dim) |

### Placement

- **With cache**: error indicator appended to end of normal output
- **Without cache**: error message replaces all output

```
# With cache:
Daily ━━━━──── 24%·3h12m | Weekly ●●○○○○ 22% [stale 5m]

# Without cache:
⚠ sub2api: connection refused
```

### Staleness

- `< 5min` → no indicator
- `5–30min` → `[stale Xm]`
- `> 30min` → `[stale Xm]` in warning color

---

## Transition States

Transition states are shown when cc-api-statusline detects a provider or credential change at runtime (standalone mode) or across invocations (piped mode).

### Visual spec

- **Icon**: `⟳` (U+27F3 — clockwise open circle arrow)
- **Color**: dim/muted — same styling as `[stale]` indicator (not warning/error color)
- **Placement**: replaces normal statusline output for that one render cycle
- **Duration**: shown until the next successful fetch resolves

### States

| Trigger | Message |
|---|---|
| `ANTHROPIC_BASE_URL` changed | `⟳ Switching provider...` |
| Token changed (same base URL) | `⟳ New credentials, refreshing...` |
| Auth error + waiting for recovery | `⚠ Auth error ⟳ Waiting for new credentials...` |

### Auth error recovery display

While in `AUTH_ERROR_HALTED` state:

```
⚠ Auth error ⟳ Waiting for new credentials...
```

The `⟳` hint is dim and appended after the error. It disappears once a successful fetch completes.

### Piped mode note

In piped mode, the transition indicator is output once for the invocation where the change is detected. Normal output resumes on the next invocation after a successful fetch.

---

## Width & Truncation

- `maxWidth`: percentage of terminal width (20–100, default 80)
- Pre-render: estimate visible length, skip lowest-priority components if over budget
- Post-render: ANSI-aware hard truncation with `…` suffix
- Drop order (lowest priority first): `plan` → `tokens` → `rateLimit` → `monthly` → `countdowns` → `weekly` → `daily` → `balance`

---

## Complete Examples

### Minimal

```json
{
  "display": { "layout": "compact" },
  "components": {
    "daily": true,
    "weekly": true,
    "monthly": false,
    "balance": true
  }
}
```

Output: `D ━━━━━━━━ 24%·3h12m | W ━━━━━━━━ 22%·5d3h | B $42.50`

### Custom render order

Components render left-to-right in the order they appear in config:

```json
{
  "components": {
    "balance": true,
    "weekly": true,
    "daily": true
  }
}
```

Output: `Balance $42.50 | Weekly ━━━━━━━━ 22%·5d3h | Daily ━━━━━━━━ 24%·3h12m`

### Per-part color + custom labels

```json
{
  "components": {
    "daily": {
      "label": { "text": "Today", "icon": "" },
      "colors": {
        "label": "#8a8a8a",
        "bar": "auto",
        "value": "white",
        "countdown": "#666666"
      },
      "countdown": { "divider": "·" }
    },
    "weekly": {
      "layout": "compact",
      "barStyle": "dot",
      "color": "chill",
      "countdown": { "prefix": "resets ", "divider": ", " }
    },
    "monthly": false,
    "balance": { "displayMode": "percentage", "color": "#00cc88" }
  }
}
```

Output: `Today ━━━━──── 24%·3h12m | W ●●○○ 22%, resets 5d3h | Balance $42.50`
(daily has gray label, white value, dim countdown; weekly uses compact layout with custom alias; balance uses hex green)
