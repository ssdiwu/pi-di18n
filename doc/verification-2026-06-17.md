# 验证记录：2026-06-17

## 环境

- 项目：`/Users/diwu/Documents/codes/Githubs/pi-di18n`
- pi 基线：`@earendil-works/pi-coding-agent` 0.79.x
- 显式加载：`pi --no-extensions --extension /Users/diwu/Documents/codes/Githubs/pi-di18n/index.ts --offline`
- locale：`PI_LOCALE=zh-CN`

## 自动测试

命令：

```bash
npm test
```

结果：

```text
Test Files  6 passed (6)
Tests       11 passed (11)
```

覆盖重点：

- extension 入口可在当前 `@earendil-works` pi 包下加载。
- extension factory 会注册 `/lang`、`i18n_get_locale`、工具覆盖、`session_before_compact`、`session_before_tree`。
- `en`、`zh-CN`、`zh-TW` bundle 覆盖 pi 0.79 全部内置 slash 命令。
- 真实调用 `installCoreHacks()` 后，`getSlashDescMode().mode === "primary"`。
- `uninstallCoreHacks()` 会恢复 `BUILTIN_SLASH_COMMANDS` 的英文原始描述。

## npm 打包 dry-run

命令：

```bash
npm pack --dry-run
```

结果摘要：

```text
name: pi-di18n
version: 0.1.0
package size: 85.3 kB
unpacked size: 374.4 kB
total files: 51
```

发布内容包含：

- `index.ts`
- `src/**`
- `locales/*.json`
- `schemas/*.json`
- `i18n.manifest.json`
- `README.md`
- `LICENSE`

## 真实 TUI 验证

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
lang:简体
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
- `slashDescMode` 已从用户基线的 `none` 修复为 `primary`。
- probe 可执行且 patch 点匹配；本次自动化未打开更多 selector，因此 hit/translated 为 0 属预期。
