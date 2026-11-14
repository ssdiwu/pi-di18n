# pi-di18n 执行计划与当前状态

> 本文件是 pi-di18n 的**当前执行状态与接续位置**唯一正文。顶部写当前状态，历史阶段向下累积，不从旧阶段表倒推现状。机制与规格分别见 [doc/架构/](doc/架构/) 与 [doc/规格/](doc/规格/)，证据见 [doc/references/](doc/references/)。

## 当前状态（2026-11-14）

**版本**：0.2.3（`package.json` 为唯一权威），`CHANGELOG.md` 同步定版。

**已落地**：三条本地化线全部可用——A 线 TUI（core-hacks 运行时 patch + runtime UI 描述缓存）、B 线 思考语言（baseline → 缓存 → LLM 兜底三层）、C 线 摘要（compact/tree 本地化）。兼容基线 Pi 1.5.x，词包覆盖 9 个 core-hacks 语言 + 25 个 UI locale + 12 个 think baseline 语言。

**本批完成**：设置值本地化三修复 + think 全局默认磁盘毒化修复 + 文档结构重组（Cozuo 式）。详见 [references/settings-localization-think-switch-2026-11-14.md](doc/references/settings-localization-think-switch-2026-11-14.md)。

**验证现状**：`npm test` 155/155 通过；`npm pack --dry-run` 通过；`scripts/verify-core-hacks-locales.mjs --check` 通过；`scripts/tui-smoke.py` 真实 TUI 冒烟通过。

**待办**：无阻塞项。下一批工作的候选见「已知未覆盖」。

| 项 | 状态 | 说明 |
|---|---|---|
| 发版 0.2.3 | 已完成 | 版本号、CHANGELOG 定版、commit、tag `v0.2.3`、push、`npm publish` 均已执行（2026-11-14，registry 已可查 0.2.3） |
| 文档结构改 Cozuo 式 | 已完成 | PLAN/架构/规格/references 分层，AGENTS.md 三节，`.artifacts/` 本机现场机制 |

**已完成的路线图切片**（B 线思考语言本地化，2026-11 完成）：切片 0 预制 baseline → 切片 1 核心通路 → 切片 2 baseline 接入 → 切片 3 健壮性与可观测性 → 切片 4 测试与文档。原始切片设计与风险表见 [references/roadmap-b-line-2026-11.md](doc/references/roadmap-b-line-2026-11.md)。

## 已知未覆盖

- Pi 1.5.x 之后的 Pi 版本未做兼容探测（core-hacks 锚点依赖实际产物，升级后须重跑全套验证）。
- 非维护语言（zh-CN 之外未列入 9 个 core-hacks 维护语言的用户）在 TUI 细节上会残留英文，属词包覆盖范围问题，不是机制缺口。
- 真实 TUI 验证以本机 Pi 1.5.2 + `hc` 终端为准，未覆盖其它终端渲染器差异。

## 接续位置

新会话接手时：

1. 读 `README.md`（入口与安装）、本文件（当前状态）、`doc/README.md`（导航）。
2. 按改动范围读 `doc/架构/`（机制）、`doc/规格/`（词包契约）、`AGENTS.md`（规则）。
3. 改动后按 `AGENTS.md` 的验证分级执行；证据落 `doc/references/`，本文件更新「当前状态」段。
