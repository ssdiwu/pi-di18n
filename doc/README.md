# pi-di18n 文档入口

1. [执行计划与当前状态](../PLAN.md)
2. [术语表](./术语表.md)
3. [架构正文](./架构/)
4. [规格正文](./规格/)
5. [决策档案](./决策档案/)
6. [经验笔记](./经验笔记.md)
7. [代理协作规则](../AGENTS.md)
8. [工程入口](../README.md)

`doc/架构/` 是当前机制的唯一正文；`doc/规格/` 是词包键集契约的唯一正文；`doc/决策档案/` 是难逆转决策的刻碑；`doc/references/` 只保存来源、验证证据与历史阶段记录（含已归档的单版本适配流水），不作为并行需求或现行实现权威。

本机原始现场（截图、抓包、原始日志）放仓库根 `.artifacts/`，已被 Git 忽略；引用它不表示文件随仓库分发。

## 架构正文（`doc/架构/`）

| 文件 | 回答什么 |
|---|---|
| [系统架构.md](./架构/系统架构.md) | 三条本地化线、运行入口与事件流、locale 真相源与状态文件、兼容基线策略 |
| [三条线机制与数据流.md](./架构/三条线机制与数据流.md) | A/B/C 各线内部机制、三层翻译源、缓存失效语义 |
| [core-hacks-ui-boundary.md](./架构/core-hacks-ui-boundary.md) | TUI patch 的 fail-soft 边界与高风险路径 |

## 规格正文（`doc/规格/`）

| 文件 | 回答什么 |
|---|---|
| [词典包与词包契约.md](./规格/词典包与词包契约.md) | 三类词包资产的键集契约、修改流程与守护测试 |

## 决策与经验

- [决策档案/README.md](./决策档案/README.md)：ADR 索引。修订以「后记」追加，不改写原文。
- [经验笔记.md](./经验笔记.md)：可改的做法与避坑经验（现象 + 做法 + 证据）。

## 证据与历史（`doc/references/`）

只保存来源、验证记录与历史阶段，不维护第二份现行正文：

| 文件 | 内容 |
|---|---|
| [settings-localization-think-switch-2026-11-14.md](./references/settings-localization-think-switch-2026-11-14.md) | 设置值本地化三修复 + think 磁盘毒化修复的测试与真实 TUI 验证 |
| [roadmap-b-line-2026-11.md](./references/roadmap-b-line-2026-11.md) | B 线切片设计与风险表（已全部落地） |
| [verification-pi-0.83-upgrade-2026-07-30.md](./references/verification-pi-0.83-upgrade-2026-07-30.md) | Pi 0.83 升级适配验证记录 |
| [core-hacks-anchors-pi-1.1.0.md](./references/core-hacks-anchors-pi-1.1.0.md) | Pi 1.1.0 core-hacks 锚点审计（已由 0.2.2 收口） |
| [slash-i18n-pi-0.79.md](./references/slash-i18n-pi-0.79.md) 等 | 各单版本适配流水，仅追溯 |

## 维护规则

- 机制变化 → 更新 `doc/架构/` 对应正文；词包契约变化 → 更新 `doc/规格/`；难逆转决策 → 新增 ADR 并同步索引；可复用做法 → 追加 `经验笔记.md`。
- 用户可感知的已完成变化 → `CHANGELOG.md`；本机原始现场 → `.artifacts/`（Git 忽略）。
- 当前状态与接续位置 → 只更新根 `PLAN.md`，不从 `doc/references/` 的历史记录倒推现状。
