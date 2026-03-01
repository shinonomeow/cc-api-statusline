# cc-api-statusline

[English](README.md) | 简体中文

在ClaudeCode状态栏显示API用量，通过轮询 Claude API 服务（sub2api、claude-relay-service 或自定义提供商）获取用量数据，并以可配置显示样式。

## 特性

- 🎨 **高度可配置** — 布局、颜色、进度条样式、显示模式任意调整
- 🔌 **提供商自动识别** — 开箱支持 sub2api、claude-relay-service 及自定义提供商
- 🎯 **Claude Code 集成** — 一键 `--install` 完成安装
- 📊 **多维度用量展示** — 每日/每周/每月配额、余额、Token数、速率限制
- 🔁 **热切换** — 自动感知 API 端点和凭证变更，无需重启
- 🔒 **高可靠性** — 无过期数据展示、无竞争条件写入、缓存自动清理

## 快速上手

### 1. 配置 API 端点

需要准备 `ANTHROPIC_BASE_URL`（代理地址）和 `ANTHROPIC_AUTH_TOKEN`（API 密钥）两个变量。

**推荐方式：写入 `~/.claude/settings.json` 的 env 字段**（会自动传递给组件）：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-proxy.example.com",
    "ANTHROPIC_AUTH_TOKEN": "your-api-token"
  }
}
```

也可以直接在 Shell 中导出：

```bash
export ANTHROPIC_BASE_URL="https://your-proxy.example.com"
export ANTHROPIC_AUTH_TOKEN="your-api-token"
```

### 2. 预览效果

```bash
bunx cc-api-statusline@latest --once
```

### 3. 安装为 Claude Code 状态栏组件（可选）

```bash
bunx cc-api-statusline@latest --install
```

此命令会自动向 `~/.claude/settings.json` 写入以下配置：

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

使用 `bunx` 可每次自动拉取最新版本，无需全局安装。如需卸载：

```bash
bunx cc-api-statusline --uninstall
```

也支持全局安装：

```bash
bun add -g cc-api-statusline
# 或
npm install -g cc-api-statusline
```

## 热切换

当 `ANTHROPIC_BASE_URL` 或 `ANTHROPIC_AUTH_TOKEN` 发生变化时（例如切换 Claude Code 配置文件或轮换密钥），cc-api-statusline 会自动检测并触发切换。切换期间会短暂显示过渡提示（`⟳ Switching provider...`），随后从新端点刷新数据，全程无需重启。

## 配置

### 样式配置（`~/.claude/cc-api-statusline/config.json`）

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

主要配置项说明：

| 配置项 | 可选值 | 默认值 | 说明 |
|--------|--------|--------|------|
| `layout` | `standard` / `percent-first` | `standard` | 标签、进度条、数值的排列顺序 |
| `displayMode` | `text` / `compact` / `emoji` / `nerd` / `hidden` | `text` | 标签样式。`nerd` 需安装 [Nerd Font](https://www.nerdfonts.com/font-downloads) |
| `progressStyle` | `bar` / `icon` / `hidden` | `icon` | 用量进度的可视化方式。`icon` 需安装 [Nerd Font](https://www.nerdfonts.com/font-downloads) |
| `barStyle` | `block` / `classic` / `dot` / `shade` / `pipe` / `braille` / `square` / `star` | `block` | 进度条字符样式 |
| `barSize` | `small` / `small-medium` / `medium` / `medium-large` / `large` | `medium` | 进度条宽度（4–12 个字符） |
| `divider` | `DividerConfig` 或 `false` | `{ text: "\|", margin: 1, color: "#555753" }` | 组件间分隔符；设为 `false` 可禁用 |
| `maxWidth` | 20–100 | `100` | 状态栏最大宽度占终端宽度的百分比 |

完整样式参考（包含每组件独立配置、颜色别名、倒计时等高级选项）请查阅 [docs/spec-tui-style.md](docs/spec-tui-style.md)。

#### User-Agent 伪装

部分提供商会限制非 Claude Code 客户端的访问，可启用此选项绕过：

```json
{
  "spoofClaudeCodeUA": true
}
```

- `false` / `undefined` — 不发送 User-Agent 请求头（默认）
- `true` — 自动获取当前 Claude Code 版本，获取失败则回退至 `claude-cli/2.1.56 (external, cli)`
- `"string"` — 使用指定的自定义 User-Agent 字符串

### API 提供商配置（`~/.claude/cc-api-statusline/api-config/`）

在此目录下以 JSON 文件形式定义自定义提供商。添加或修改后，执行以下命令使其生效：

```bash
cc-api-statusline --apply-config
```

完整 Schema 请参阅 [docs/api-config-reference.md](docs/api-config-reference.md)。

## [ccstatusline](https://github.com/anthropics/claude-code) 自定义命令

在 `~/.claude/ccstatusline/config.json` 中添加如下配置：

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

## 环境变量

以下所有变量均为可选——`ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 可通过 `settings.json` 的 env 字段配置，无需在 Shell 中手动导出（详见[快速上手](#快速上手)）。

| 变量 | 是否可选 | 说明 |
|------|----------|------|
| `ANTHROPIC_BASE_URL` | 是 | API 端点地址（如 `https://api.sub2api.com`） |
| `ANTHROPIC_AUTH_TOKEN` | 是 | API 密钥或Token |
| `CC_STATUSLINE_PROVIDER` | 是 | 手动指定提供商（`sub2api`、`claude-relay-service` 或自定义） |
| `CC_STATUSLINE_POLL` | 是 | 轮询间隔（秒，最小 5） |
| `CC_STATUSLINE_TIMEOUT` | 是 | 管道模式超时时间（毫秒，默认 5000） |
| `DEBUG` 或 `CC_STATUSLINE_DEBUG` | 是 | 开启调试日志，输出至 `~/.claude/cc-api-statusline/debug.log` |

## 常见问题

### 提示 "Missing required environment variable"

请通过 Shell 导出或 `settings.json` env 字段设置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN`（详见[快速上手](#快速上手)）。

### 提示 "Unknown provider"

提供商自动识别失败，请手动指定：

```bash
export CC_STATUSLINE_PROVIDER="sub2api"
```

或在 `api-config/` 目录下定义自定义提供商。

### 显示 "[offline]" 或 "[stale]"

通常由网络错误或缓存过期导致，可开启调试日志排查：

```bash
DEBUG=1 cc-api-statusline --once
tail -f ~/.claude/cc-api-statusline/debug.log
```

排查要点：
- `ANTHROPIC_BASE_URL` 对应的网络是否可达
- API 端点是否正常响应
- Token是否有效且未过期

### 管道模式响应较慢

```bash
# 单独预热缓存
cc-api-statusline --once
# 查看详细耗时
DEBUG=1 cc-api-statusline --once
```

检查配置中的 `pipedRequestTimeoutMs`（默认 3000ms），并确认 `~/.claude/cc-api-statusline/cache-*.json` 文件已存在。

### Claude Code 中组件显示 `[Exit: 1]`

在 `~/.claude/settings.json` 中开启调试日志：

```json
{
  "statusLine": {
    "type": "command",
    "command": "DEBUG=1 bunx -y cc-api-statusline@latest",
    "padding": 0
  }
}
```

然后查看日志：`tail -f ~/.claude/cc-api-statusline/debug.log`

## 开发

| 命令 | 说明 |
|------|------|
| `bun install` | 安装依赖 |
| `bun run start` | 单次获取（--once 模式），用于快速调试 |
| `bun run example` | 模拟管道模式 |
| `bun run test` | 运行测试 |
| `bun run lint` | 代码检查 |
| `bun run build` | 构建 |
| `bun run check` | 运行全部检查 |

### 调试日志

启用详细执行日志：

```bash
# 开启调试
DEBUG=1 cc-api-statusline --once

# 用于 Claude Code 组件时，在 settings.json 中设置：
# "command": "DEBUG=1 bunx -y cc-api-statusline@latest"

# 实时追踪日志
tail -f ~/.claude/cc-api-statusline/debug.log

# 搜索错误记录
grep "ERROR" ~/.claude/cc-api-statusline/debug.log
```

调试日志涵盖：执行时间戳、模式检测、配置与缓存状态、执行路径（A/B/C/D）、请求耗时及错误详情。

日志文件自动轮转（约每 20 次调用触发一次）：
- `debug.log` ≥ 500 KB → 归档为 `debug.YYYY-MM-DDTHH-MM.log`
- 归档超过 24 小时 → gzip 压缩
- 压缩归档超过 3 天 → 自动删除

## 测试

- **691 个测试**，覆盖 **39 个测试文件**
- 所有服务、渲染器及工具函数的单元测试
- 核心执行路径测试（A/B/C/D）
- 隔离环境端到端冒烟测试
- 性能测试（验证 p95 < 600ms）
- 缓存垃圾回收测试
- GitHub Actions CI/CD 流水线

运行：`bun run check`

## 许可证

MIT

## 相关文档

- [实现手册](docs/implementation-handbook.md)
- [当前实现说明](docs/current-implementation.md)
- [TUI 样式规范](docs/spec-tui-style.md)
- [API 轮询规范](docs/spec-api-polling.md)
- [自定义提供商规范](docs/spec-custom-providers.md)
