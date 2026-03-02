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
    "layout":        "standard",
    "displayMode":   "text",
    "progressStyle": "icon",
    "barSize":       "medium",
    "barStyle":      "block",
    "divider":       { "text": "|", "margin": 1, "color": "#555753" },
    "maxWidth":      100,
    "clockFormat":   "24h"
  }
}
```

| Key | Values | Default | Description |
|---|---|---|---|
| `layout` | `standard` / `percent-first` | `standard` | Assembly order of label, progress, value, countdown |
| `displayMode` | `text` / `compact` / `emoji` / `nerd` / `hidden` | `text` | Label display style |
| `progressStyle` | `bar` / `icon` / `hidden` | `icon` | Usage fraction visualization |
| `barSize` | `small`(4) / `small-medium`(6) / `medium`(8) / `medium-large`(10) / `large`(12) | `medium` | Bar character width |
| `barStyle` | name or `{ fill, empty }` | `block` | Bar character style (see below) |
| `divider` | `DividerConfig` or `false` | `{ text: "\|", margin: 1, color: "#555753" }` | Between components; `false` disables |
| `maxWidth` | 20–100 | `100` | % of terminal width |
| `clockFormat` | `12h` / `24h` | `24h` | For countdown time display |

---

## Layouts

Controls the assembly order of label, progress, and value.

| Layout | Description | Example |
|---|---|---|
| `standard` | label → bar → value → countdown | `Daily ━━━━━━━━ 24%·3h12m` |
| `percent-first` | label → value → bar → countdown | `Daily 24% ━━━━━━━━·3h12m` |

> **Note:** Label style (full text, single letter, emoji, nerd icon, or hidden) is controlled by `displayMode`, not `layout`. See [Display Modes](#display-modes) below. Layout and displayMode are orthogonal settings.

### Layout effects

- `percent-first` moves the percentage before the bar
- Per-component overrides still win (see below)

---

## Progress Styles

Controls how the usage fraction is visualized (`progressStyle` key).

| Style | Example |
|---|---|
| `bar` | `Daily ████░░░░ 24%` |
| `icon` | `Daily 󰪞 24%` (nerd-font progress circle) |
| `hidden` | `Daily 24%` (no bar or icon) |

### `icon` nerd-font icon mapping

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

## Display Modes

Controls the label style for all components (`displayMode` key).

| Mode | Example | Description |
|---|---|---|
| `text` | `Daily 24%` | Full text labels (default) |
| `compact` | `D 24%` | Single-character abbreviations |
| `emoji` | `📅 24%` | Emoji labels |
| `nerd` | ` 24%` | Nerd font icon labels |
| `hidden` | `24%` | No labels shown |

### Compact label mapping

| Component | Short label |
|---|---|
| `daily` | `D` |
| `weekly` | `W` |
| `monthly` | `M` |
| `balance` | `B` |
| `tokens` | `T` |
| `rateLimit` | `R` |

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

When `label` is a string, it is used as the text label. When it's an object, you can set both `text` and `icon` variants. The displayMode decides which is rendered:
- `text` / `percent-first` layout → uses `label.text`
- `compact` displayMode → uses first character of `label.text`
- `hidden` displayMode → no label
- If `displayMode: "nerd"` → `label.icon` is used if set

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
      "displayMode": "compact",
      "progressStyle": "hidden",
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
| `block` | `█` | `░` | `████░░░░` (default) |
| `classic` | `━` | `─` | `━━━━────` |
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

### Built-in color aliases

Seven aliases are predefined. All share default thresholds `[37.5, 62.5, 75, 87.5, 100]`.

| Alias | Description | Tier colors (low → high) |
|-------|-------------|--------------------------|
| `auto` | Default 5-tier gradient | `cool` → `comfortable` → `warm` → `hot` → `critical` |
| `vibrant` | Bold neon gradient | `#00D9FF` → `#4ADE80` → `#FDE047` → `#FB923C` → `#F87171` |
| `pastel` | Soft, gentle tones | `pastel-cool` → `pastel-comfortable` → `pastel-medium` → `pastel-warm` → `pastel-hot` |
| `bright` | Vibrant pastels | `bright-cool` → `bright-comfortable` → `bright-medium` → `bright-warm` → `bright-hot` |
| `ocean` | Deep blue to coral | `ocean-cool` → `ocean-comfortable` → `ocean-medium` → `ocean-warm` → `ocean-hot` |
| `neutral` | Muted neutrals | `neutral-cool` → `neutral-comfortable` → `neutral-warm` → `neutral-hot` → `neutral-critical` |
| `chill` | Cool blues to magenta | `cyan` → `cyan` → `blue` → `blue` → `magenta` |

Theme color name → hex reference:

| Name | Hex | | Name | Hex |
|------|-----|-|------|-----|
| `cool` | `#56B6C2` | | `pastel-cool` | `#BAD7F2` |
| `comfortable` | `#5EBE8A` | | `pastel-comfortable` | `#BAF2D8` |
| `warm` | `#C9A84C` | | `pastel-medium` | `#BAF2BB` |
| `hot` | `#D68B45` | | `pastel-warm` | `#F2E2BA` |
| `critical` | `#D45A5A` | | `pastel-hot` | `#F2BAC9` |
| `bright-cool` | `#90F1EF` | | `ocean-cool` | `#0081A7` |
| `bright-comfortable` | `#7BF1A8` | | `ocean-comfortable` | `#00AFB9` |
| `bright-medium` | `#C1FBA4` | | `ocean-medium` | `#FDFCDC` |
| `bright-warm` | `#FFEF9F` | | `ocean-warm` | `#FED9B7` |
| `bright-hot` | `#FFD6E0` | | `ocean-hot` | `#F07167` |
| `neutral-cool` | `#D8E2DC` | | `neutral-warm` | `#FFCAD4` |
| `neutral-comfortable` | `#FFE5D9` | | `neutral-hot` | `#F4ACB7` |
| `neutral-critical` | `#9D8189` | | | |

The `auto` alias definition (shown for reference — it is predefined and overrideable):

```json
{
  "colors": {
    "auto": {
      "tiers": [
        { "color": "cool",        "maxPercent": 37.5 },
        { "color": "comfortable", "maxPercent": 62.5 },
        { "color": "warm",        "maxPercent": 75 },
        { "color": "hot",         "maxPercent": 87.5 },
        { "color": "critical",    "maxPercent": 100 }
      ]
    }
  }
}
```

Each tier applies when usage is below its `maxPercent`. Usage above the last tier uses the last tier's color.

### Custom color aliases

Define named aliases in the `colors` config key using the `tiers` format. `chill` is a predefined alias shown for illustration; `binary` is a user-defined example:

```json
{
  "colors": {
    "chill": {
      "tiers": [
        { "color": "cyan",    "maxPercent": 62.5 },
        { "color": "blue",    "maxPercent": 87.5 },
        { "color": "magenta", "maxPercent": 92.5 }
      ]
    },
    "binary": {
      "tiers": [
        { "color": "green", "maxPercent": 90 },
        { "color": "red",   "maxPercent": 100 }
      ]
    }
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

- `maxWidth`: percentage of terminal width (20–100, default 100)
- Pre-render: estimate visible length, skip lowest-priority components if over budget
- Post-render: ANSI-aware hard truncation with `…` suffix
- Drop order (lowest priority first): `plan` → `tokens` → `rateLimit` → `monthly` → `countdowns` → `weekly` → `daily` → `balance`

---

## Complete Examples

### Minimal

```json
{
  "display": { "displayMode": "compact" },
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
      "displayMode": "compact",
      "barStyle": "dot",
      "color": "chill",
      "countdown": { "prefix": "resets ", "divider": ", " }
    },
    "monthly": false,
    "balance": { "progressStyle": "hidden", "color": "#00cc88" }
  }
}
```

Output: `Today ━━━━──── 24%·3h12m | W ●●○○ 22%, resets 5d3h | Balance $42.50`
(daily has gray label, white value, dim countdown; weekly uses compact layout with custom alias; balance uses hex green)
