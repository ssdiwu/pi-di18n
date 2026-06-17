# pi 0.79 slash 命令本地化修复

## 背景

用户在 pi 0.79 / zh-CN 环境中观察到部分系统命令描述没有汉化。运行时诊断基线：

```text
locale=zh-CN fallback=en
slashDescMode=none
coreDist=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist
probe.enabled=true total=6 matched=6 notFound=0 hit=3 translated=3
```

## 诊断

- `coreDist` 已命中真实 pi 0.79 dist，说明 core-hacks 基础路径未坏。
- `probe total=6 matched=6` 说明常规 TUI patch 点已匹配。
- `locales/zh-CN.json` 原本没有任何 `pi.slash.*` key。
- `locales/en.json` 原本也没有 `pi.slash.*` 基准 key。
- `installCoreHacks` 原逻辑写死 `isZhTw()`，导致 zh-CN 的 `slashDescMode` 直接落到 `none`。

## 修复

1. 在 `locales/en.json`、`locales/zh-CN.json` 与 `locales/zh-TW.json` 补齐 pi 0.79 的 22 条内置 slash 命令描述 key：
   - `pi.slash.settings.description`
   - `pi.slash.model.description`
   - `pi.slash.scoped-models.description`
   - `pi.slash.export.description`
   - `pi.slash.import.description`
   - `pi.slash.share.description`
   - `pi.slash.copy.description`
   - `pi.slash.name.description`
   - `pi.slash.session.description`
   - `pi.slash.changelog.description`
   - `pi.slash.hotkeys.description`
   - `pi.slash.fork.description`
   - `pi.slash.clone.description`
   - `pi.slash.tree.description`
   - `pi.slash.trust.description`
   - `pi.slash.login.description`
   - `pi.slash.logout.description`
   - `pi.slash.new.description`
   - `pi.slash.compact.description`
   - `pi.slash.resume.description`
   - `pi.slash.reload.description`
   - `pi.slash.quit.description`
2. 将 `installCoreHacks` 的 slash 描述 mode 判定从 `isZhTw()` 改为所有非 `en` locale。
3. 将新项目依赖 scope 迁移到 `@earendil-works/*`；dist fallback 路径也改为 `@earendil-works/pi-coding-agent`。
4. 修复 `uninstallCoreHacks()`：关闭 hacks 时恢复已 patch 的 `BUILTIN_SLASH_COMMANDS` 原始 description，避免 `/lang hacks off` 后命令描述仍停留在本地化状态。

## 验证

自动测试：

```bash
npm test
```

覆盖：

- 模块能在当前 `@earendil-works` 包下加载。
- `zh-CN`、`zh-TW` 与 `en` bundle 覆盖 pi 0.79 的全部 `BUILTIN_SLASH_COMMANDS`。
- `zh-CN`、`zh-TW` 的 22 条命令描述全部与英文原文不同。
- `installCoreHacks()` 后 `slashDescMode=primary`，`uninstallCoreHacks()` 后 slash 描述恢复原文。
- compaction locale 与模板仍保持原 pi-compaction-i18n 行为。

真实 pi 会话建议复测：

```text
/lang zh-CN
/lang debug
/lang probe
```

期望：`slashDescMode` 从 `none` 变为 `primary`，并且 slash 命令描述显示中文。
