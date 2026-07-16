# pi-di18n

[English](./README.md) | [简体中文](./README-zh.md) | [日本語](./README-ja.md) | [한국어](./README-ko.md)

`pi-di18n` 是 [pi](https://github.com/earendil-works/pi-coding-agent) 的本地化扩展。它接续 `pi-i18n` 的完整 TUI i18n 与 `core-hacks` 路线，整合 `pi-compaction-i18n` 的摘要本地化能力，并新增 `/lang think`：让发给 LLM 的工具/参数说明跟随当前语言。

## 本地化范围

`pi-di18n` 分三条线：

| 线 | 给谁看 | 覆盖范围 |
|---|---|---|
| A 线：TUI 本地化 | 用户 | 按钮、selector、状态/警告/错误、slash 命令描述、session selector 文案 |
| B 线：思考语言本地化 | LLM | provider payload 里的 tool / parameter `description` |
| C 线：摘要本地化 | 用户 | `/compact` 与 `/tree` 摘要 |

## 功能

- **完整 TUI 本地化**：保留 `core-hacks`，运行时 patch pi 内部渲染路径，覆盖按钮、selector、状态消息和内置 slash 命令描述。
- **slash 命令描述修复**：为 pi 0.79 的内置 slash 命令补齐 `pi.slash.<name>.description`，包括 `zh-CN`。
- **session selector 翻译**：覆盖 `Resume Session`、`Threaded`、`Recent`、`Fuzzy`、删除提示等可见文案。
- **不侵入状态栏**：不替换 pi 原生 footer/status bar，保留模型、目录、token、git、worktree 等状态信息。
- **runtime UI description 本地化**：异步本地化扩展、提示词模板、skill 命令在 autocomplete UI 里的说明，并写入本地缓存，不阻塞渲染。
- **LLM 思考语言本地化**：`/lang think on` 会替换 provider request payload 里的工具/参数说明，让模型读到当前 `/lang` 语言。
- **真实 provider payload 覆盖**：支持 OpenAI-style、Anthropic、Google/Gemini 三种工具 schema：
  - OpenAI-style：`tools[].function.description` 与 `function.parameters.properties.*.description`
  - Anthropic：`tools[].description` 与 `input_schema.properties.*.description`
  - Google/Gemini：`tools[].functionDeclarations[].description` 与 `parametersJsonSchema.properties.*.description`
- **12 语言预制 baseline**：内置 `zh-CN`、`zh-TW`、`ja`、`ko`、`ru`、`vi`、`es`、`pt-BR`、`de`、`fr`、`id`、`hi` 的离线翻译。
- **运行时兜底与缓存**：baseline 没覆盖的新工具会用当前 session 模型翻译，并缓存到 `~/.pi/agent/state/pi-di18n/think.json`；缓存按英文原文失效。
- **摘要本地化**：接管 `session_before_compact` 和 `session_before_tree`，让压缩摘要与分支摘要跟随 `/lang`。
- **扩展 i18n API 兼容**：保留 `pi-i18n/requestApi` 与 `pi-core/i18n/requestApi` 事件，供其他扩展请求翻译。

## 安装

发布后：

```bash
pi install npm:pi-di18n
```

本地开发：

```bash
pi install /absolute/path/to/pi-di18n
```

然后重启 pi。`/reload` 可重新加载扩展资源；但修改 `core-hacks` 后必须重启 pi，因为其 monkeypatch（猴子补丁）保留在当前进程中。

只测试当前 checkout、且不加载已安装扩展：

```bash
pi -ne -e /absolute/path/to/pi-di18n/index.ts --offline
```

## 使用

基础语言设置：

```text
/lang setup beginner
/lang zh-CN
/lang debug
/lang probe
```

开启 LLM 思考语言本地化：

```text
/lang think on
/lang think doctor
```

关闭：

```text
/lang think off
```

清理运行时翻译缓存：

```text
/lang think clear      # 清当前 locale
/lang think clear-all  # 清全部 locale
```

摘要本地化不需要额外命令。触发 `/compact` 或 `/tree` 分支摘要时，它会自动跟随当前 `/lang`。

## `/lang think` 行为

`/lang think` 不维护第二个语言设置，它只跟随当前 `/lang` locale。

```text
/lang zh-CN
/lang think on
```

该功能默认关闭。开启后按三层查询：

1. 随包预制 baseline；
2. 带英文原文失效比对的本地缓存；
3. 使用当前 session 模型的运行时 LLM 兜底。

安全边界：只翻译 prose `description`。工具名、参数名、`type`、`enum`、默认值、取值和 schema 结构都不翻译。

## 诊断

```text
/lang debug
/lang probe
/lang think doctor
```

`/lang think doctor` 会报告：

- 当前 locale 与开关状态；
- session 工具/参数数量；
- baseline 覆盖数量；
- 缓存数量；
- 英文原文变化导致的过期条目；
- 仍需运行时翻译的 pending 条目。

## 开发

```bash
npm install
npm test
npm pack --dry-run
```

当前验证基线：

```text
Test Files  17 passed (17)
Tests       88 passed (88)
```

详细验证记录见 [`doc/40-版本实施方案/verification-2026-06-17.md`](./doc/40-%E7%89%88%E6%9C%AC%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88/verification-2026-06-17.md)。

## 目录结构

| 路径 | 说明 |
|---|---|
| `index.ts` | 扩展入口；注册 `/lang`、`core-hacks`、思考语言本地化与摘要本地化 hook |
| `src/core-hacks.ts` | TUI 本地化运行时 patch |
| `src/pi-ui.ts` | 工具渲染、按钮等 UI surface 的本地化 |
| `src/compaction/` | `/compact` 与 `/tree` 摘要本地化 |
| `src/think/` | B 线：LLM 思考语言本地化 |
| `src/think-locales/` | 预制 baseline：`en` 源基准 + 12 目标语言 |
| `scripts/export-think-baseline.mjs` | 导出 pi 内置工具英文说明；pi 升级时可重跑 |
| `locales/` | i18n bundle |
| `src/core-hacks-locales/` | `core-hacks` 的 exact / substring 翻译包 |
| `tests/` | vitest 回归测试 |
| `doc/` | 架构说明、路线图、ADR、验证记录、术语表 |

## 兼容性

当前基线是 `@earendil-works/pi-coding-agent` 0.79.x。

pi 目前没有原生完整 TUI i18n API。因此 TUI 本地化依赖 best-effort 的 `core-hacks` patch pi 内部渲染路径。每次 pi 升级后请运行：

```text
/lang debug
/lang probe
```

以及：

```bash
npm test
npm pack --dry-run
```

## License

MIT
