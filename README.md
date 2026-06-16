# pi-di18n

`pi-di18n` 是 pi 的本地化扩展：接手 `pi-i18n` 的 TUI i18n / core-hacks 路线，并整合 `pi-compaction-i18n` 的 `/compact` 与 `/tree` 摘要本地化能力。

## 功能

- **TUI 本地化**：保留 core-hacks，运行时 patch pi 内部渲染路径，覆盖按钮文字、selector、状态/警告/错误、slash 命令描述等高影响 UI 表面。
- **slash 命令描述修复**：补齐 pi 0.79 内置 slash 命令的 `pi.slash.<name>.description` bundle key，修复 zh-CN 下 `slashDescMode=none` 的历史问题。
- **摘要本地化**：整合 `pi-compaction-i18n`，接管 `session_before_compact` 与 `session_before_tree`，让压缩摘要和分支摘要跟随 `/lang` 当前 locale 输出。
- **扩展 i18n API**：保留 `pi-i18n/requestApi` 与 `pi-core/i18n/requestApi` 兼容事件，供其他扩展请求翻译 API。

## 安装

发布后使用 pi 安装：

```bash
pi install npm:pi-di18n
```

本地开发安装：

```bash
pi install /Users/diwu/Documents/codes/Githubs/pi-di18n
```

安装后重启 pi 或运行 `/reload`。

## 使用

```text
/lang setup beginner
/lang zh-CN
/lang doctor
/lang debug
/lang probe
```

摘要本地化无需单独命令：触发 `/compact` 或 `/tree` 分支摘要时自动生效，并使用 `/lang` 当前 locale。

## pi 0.79 修复点

当前 pi 0.79 的内置 slash 命令共 22 条。`pi-i18n` 原版在 zh-CN 下没有 `pi.slash.*` bundle key，且 `installCoreHacks` 中的 `slashDescMode` 判定写死 `isZhTw()`，导致 zh-CN 诊断显示：

```text
slashDescMode=none
```

`pi-di18n` 修复为：

- `en` 与 `zh-CN` bundle 均包含 22 条 `pi.slash.<name>.description` key。
- `installCoreHacks` 对所有非 `en` locale 走 `primary/fallback` 判定，不再只允许 zh-TW。
- 测试校验 zh-CN 对 pi 0.79 全部内置 slash 命令都有本地化翻译。

## 开发

```bash
npm install
npm test
npm pack --dry-run
```

## 目录

| 路径 | 说明 |
|------|------|
| `index.ts` | pi 扩展入口，注册 `/lang`、core-hacks、摘要本地化事件 |
| `src/core-hacks.ts` | TUI 本地化 runtime patch |
| `src/pi-ui.ts` | 工具渲染/按钮等 UI 本地化 |
| `src/compaction/` | `/compact` 与 `/tree` 摘要本地化 |
| `locales/` | i18n bundle |
| `src/core-hacks-locales/` | core-hacks exact/substring 翻译包 |
| `tests/` | vitest 回归测试 |
| `doc/` | 设计记录、兼容性说明、术语表 |

## 兼容性说明

pi 上游当前没有原生 i18n API。TUI 本地化只能通过 core-hacks patch 内部渲染路径实现，属于 best-effort；每次 pi 升级后都应运行 `/lang debug`、`/lang probe` 与 `npm test` 复测。

## License

MIT
