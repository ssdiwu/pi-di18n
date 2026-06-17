# 验证记录：2026-06-17

## 环境

- 项目：`/Users/diwu/Documents/codes/Githubs/pi-di18n`
- pi 基线：`@earendil-works/pi-coding-agent` 0.79.x
- 真实进程加载方式：`pi -ne -e /Users/diwu/Documents/codes/Githubs/pi-di18n/index.ts --offline`
- 约束：`-ne` 禁用 extension discovery，仅显式加载当前 `pi-di18n`，不加载用户现有 i18n 扩展。
- locale：`PI_LOCALE=zh-CN`
- think 状态文件：`~/.pi/agent/state/pi-di18n/think.json`

## 自动测试

命令：

```bash
npm test
```

结果：

```text
Test Files  8 passed (8)
Tests       38 passed (38)
```

覆盖重点：

- extension 入口可在当前 `@earendil-works` pi 包下加载。
- extension factory 会注册 `/lang`、`i18n_get_locale`、工具覆盖、`session_before_compact`、`session_before_tree`。
- `before_provider_request` hook 已注册。
- `en`、`zh-CN`、`zh-TW` bundle 覆盖 pi 0.79 全部内置 slash 命令。
- 真实调用 `installCoreHacks()` 后，`getSlashDescMode().mode === "primary"`。
- `uninstallCoreHacks()` 会恢复 `BUILTIN_SLASH_COMMANDS` 的英文原始描述。
- B 线三层查询：baseline -> cache -> LLM fallback。
- `think on/off`、`locale=en` 不替换、第三方工具无 model 不崩。
- OpenAI-style provider payload：`tools[].function.description` + `function.parameters.properties.*.description`。
- Anthropic provider payload：`tools[].description` + `input_schema.properties.*.description`。
- Google/Gemini provider payload：`tools[].functionDeclarations[].description` + `parametersJsonSchema.properties.*.description`。
- `/lang think doctor`：baseline 覆盖、缓存条数、过期条数、pending 条数。
- `/lang think clear` / `/lang think clear-all`：缓存清理。

## npm 打包 dry-run

命令：

```bash
npm pack --dry-run
```

结果摘要：

```text
package size: 113.3 kB
unpacked size: 464.8 kB
total files: 71
```

发布内容包含：

- `index.ts`
- `src/**`
- `src/think/**`
- `src/think-locales/*.json`
- `locales/*.json`
- `schemas/*.json`
- `i18n.manifest.json`
- `README.md`
- `LICENSE`

## 切片 0/2：12 语言 baseline 验证

验证命令等价于逐语言执行：

```js
hasBaseline(locale)
countBaseline(locale)
getBaselineTranslation(locale, "tool", "read")
```

结果：

```text
zh-CN  tool=7 param=21 OK
zh-TW  tool=7 param=21 OK
ja     tool=7 param=21 OK
ko     tool=7 param=21 OK
ru     tool=7 param=21 OK
vi     tool=7 param=21 OK
es     tool=7 param=21 OK
pt-BR  tool=7 param=21 OK
de     tool=7 param=21 OK
fr     tool=7 param=21 OK
id     tool=7 param=21 OK
hi     tool=7 param=21 OK
```

结论：

- 12 个非英文 baseline 文件齐全。
- 每个 locale 覆盖 `7` 个 tool description + `21` 个 param description。
- `read` 工具翻译命中且非英文原文。
- baseline 已作为三层查询第 1 层接入；命中时跳过 LLM 调用。

## 切片 1：真实 provider payload 替换验证

测试覆盖三类真实 payload 形态：

| Provider 形态 | tool description | param description |
|---|---|---|
| OpenAI-style | `tools[].function.description` | `function.parameters.properties.*.description` |
| Anthropic | `tools[].description` | `input_schema.properties.*.description` |
| Google/Gemini | `tools[].functionDeclarations[].description` | `parametersJsonSchema.properties.*.description` |

关键断言：

- zh-CN：`read` description 不再包含 `Read the contents of a file`，包含 `读取`。
- zh-CN：`path` param description 不再包含 `Path to the file`，包含 `路径`。
- ja：`read` description 包含 `ファイル`。
- `think off`：不替换，payload 保持英文。
- `locale=en`：不替换。
- 只改 `description`，不改 `name` / `type` / schema 结构。

## 切片 3：健壮性与可观测性验证

新增命令：

```text
/lang think doctor
/lang think clear
/lang think clear-all
```

覆盖行为：

- `doctor` 报告：enabled、session 工具/参数数、baseline 覆盖、缓存 tool/param 条数、过期条数、pending 待翻译条数。
- `clear` 清当前 locale 缓存。
- `clear-all` 清全部 locale 缓存。
- 无 `getAllTools` 时 doctor 不崩。
- 缓存 en 原文与当前 description 不一致时计入过期。
- 非 baseline 且无有效缓存时计入 pending。
- in-flight 从 Set 升级为 Promise map：同步兜底会等待后台预翻译已有 promise，避免同 key 重复 LLM 翻译。

## 真实 pi 进程验证

所有真实进程验证均使用：

```bash
pi -ne -e /Users/diwu/Documents/codes/Githubs/pi-di18n/index.ts --offline
```

### `/lang think doctor`

通过 stdin 交互管道发送：

```text
/lang think doctor
/quit
```

结果：

```text
doctor exit=0
```

结论：真实命令路径可执行，不崩。

### `/lang think clear`

预设状态：

```json
{"enabled":false,"locales":{"zh-CN":{"tool":{"read":{"en":"en","translated":"中"}},"param":{"read:path":{"en":"en","translated":"中"}}}}}
```

通过 stdin 交互管道发送：

```text
/lang think clear
/quit
```

结果：

```text
clear exit=0
clear verified=true
```

清理后状态：

```json
{"enabled":false,"locales":{}}
```

结论：真实命令路径可清除当前 locale 缓存。

### think on + zh-CN baseline 真实回复

预设状态：

```json
{"enabled":true,"locales":{}}
```

命令：

```bash
PI_LOCALE=zh-CN pi -ne -e /Users/diwu/Documents/codes/Githubs/pi-di18n/index.ts --offline -p "不要真的读文件。只根据你看到的工具说明，用一句话说明 read 工具能做什么"
```

关键回复：

```text
`read`（读取文件工具）可以读取文本文件内容，也支持把 `jpg/png/gif/webp` 图片作为附件发送，并可用 `offset/limit` 分段读取大文件。
```

结论：真实 LLM 回复包含 `读取`、`文本文件`、`图片`、`offset`、`limit`，证明 baseline 描述已进入真实 provider payload。

## 真实 TUI 验证（A 线 core-hacks）

命令通过 Python pty 启动真实 pi TUI，并发送：

```text
/lang debug
/lang probe
/quit
```

关键输出：

```text
[Extensions]
  pi-di18n
locale=zh-CN fallback=en
slashDescMode=primary
coreDist=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist
probe.enabled=true total=6 matched=6 notFound=0 hit=0 translated=0
cwd=/Users/diwu/Documents/codes/Githubs/pi-di18n
loader.updateDisplay: state=matched hooked=1 hit=0 translated=0
```

结论：

- `pi-di18n` 可被 pi 0.79 真实 TUI 加载。
- `/lang debug` 可执行。
- `coreDist` 命中当前 `@earendil-works/pi-coding-agent/dist`。
- `slashDescMode` 为 `primary`。
- probe 可执行且 patch 点匹配；自动化未打开更多 selector，因此 hit/translated 为 0 属预期。
- `pi-di18n` 不再覆盖 pi 原生 footer/status bar；模型、目录、token、git、worktree 等状态信息由 pi 原生 footer 保留。

## 收尾状态

最终确认：

```bash
rg '~/.pi/agent/di18n.json|兑底' doc src README.md
```

结果：无残留。

最终 think 状态：

```json
{"enabled":false,"locales":{}}
```

结论：验证完成后已恢复默认关，未污染后续真实 pi 会话。
