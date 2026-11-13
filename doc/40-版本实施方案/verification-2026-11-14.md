# 2026-11-14 设置值本地化与 think 开关修复验证

## 验证范围

本次会话三个修复的自动测试与真实 TUI 验证：

1. 设置行值切换后回退英文（TUI 模式显示 `fullscreen`）
2. 设置值译文比原文宽时被截断（`all` 显示为 `全…`）
3. think 全局默认被磁盘毒化（新会话一律「已关闭」，`/lang think on` 无法纠正）

## 自动测试

```text
$ npm test
Test Files  32 passed (32)
Tests       155 passed (155)
```

本轮清掉了存量失败的 `slash-i18n.test.ts` `/llama` 用例（见下文「测试校准」）。

```text
$ npm pack --dry-run
total files: 80
```

## 真实 Pi 1.5.2 TUI（hc 终端实测）

- 设置面板搜 `tui`，对「TUI 模式」连续按 Enter/Space 循环切换：`全屏 → 常规 → 全屏 → 常规 → 全屏`，每次切换后值保持中文，无回退英文、无跳项（存储值保持原文，`values.indexOf` 循环正常）。
- 「引导模式」「后续消息模式」值完整显示「全部」，不再被宽度保护截断为「全…」。
- 「引导模式」描述行：`'逐条发送'：一次发送一条并等待响应。'全部'：一次发送全部。`，英文枚举 token 已随八语言包替换。
- think 修复后新开会话：footer 显示 `lang:简体（think:开启，跟随 /lang）`，`/lang think` 无参查询返回「本会话已开启」。修复前同一环境新会话显示「已关闭」，复现并确认根因为磁盘 `think.json` 的 `enabled: false`（旧代码落盘毒化），已现场修正该文件。

## 测试校准（存量失败处理）

`tests/slash-i18n.test.ts` 的 `/llama` 用例断言「bundle 未知的描述原文应原样返回」，但 `tSlashDesc` 的运行时缓存路径（`resolveRuntimeCommandDescription`）会翻译它（`ui.json` 中存在 `command:llama` 缓存条目可证）；且 `/llama` 命令 Pi 1.5.x 已删除，词包不再发布该键。断言的行为前提已不成立。改为：内置命令（`/reload`）按名称经 bundle 翻译，并保留 `[t]` 来源标签前缀断言——覆盖同一代码路径（tag 拼接 + name 查表），不依赖已删除的命令。

## 文档校准（同批）

- README 四语言版兼容基线统一为 1.5.x（zh/ja/ko 原为 0.83.x）；删除英文版 `/llama` feature 引用。
- `tests/README.md` 覆盖点表登记 `pi-15x-compat`、`core-hacks-locale-alignment`，更新 slash/settings/llama 描述。
- `scripts/README.md` 补登记 `verify-core-hacks-locales.mjs`、`tui-smoke.py`。
- `doc/30-路线图/路线图.md`：切片 4 标 ✅、决策 7 开关结论补 0.2.2 修订、清空已完成的 session-selector 挂账。
- `doc/术语表.md` `/lang think` 条目、`doc/决策档案/0002` 加后记（默认开修订，刻碑原文保留）。
- `doc/40-版本实施方案/pi-1.1.0-core-hacks-i18n.md` 标注收口（实际由 0.2.2 完成）。

## 结构重组（2026-11-14 第二批，对齐 pi-dgoal / pi-dteam 文档范式）

507 指出文档结构偏移：`10-架构与运行/` 放的全是单版本适配流水，当前架构权威缺位。对照 dgoal/dteam 的分层范式重组：

- 归档 5 份单版本适配文档（pi-0.79～0.83）与 3 份过期验证 + 1 份已收口版本方案 → `90-归档/`（各加归档说明，保留后继入口）。
- 新建当前架构权威：`10-系统架构.md`（三线结构、事件流、状态文件语义、兼容基线策略）、`11-三条线机制与数据流.md`（各线内部机制）、`12-词典包与词包契约.md`（键集契约与修改流程）。
- 新建 `doc/经验笔记.md`（4 条：渲染期折行、磁盘毒化、宽度截断、/tree 不发 session_start）。
- `AGENTS.md` 重写：领域分节（项目边界/TUI 边界/工程与失败恢复），补三线职责、状态文件边界、沉淀出口、分级验证（含 tui-smoke、词典对齐脚本）。
- `doc/README.md` 重写：编号阅读顺序、目录职责表（是否权威）、沉淀出口约定、维护规则。

## 遗留

- 发版（版本号、tag、npm publish）待 507 授权后按流程执行；CHANGELOG 保持 `## Unreleased`。
