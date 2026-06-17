# 思考语言本地化只翻译 description，不翻译字段名和值

## 背景

思考语言本地化要翻译 pi 发给 LLM 的 payload。rpiv-i18n 警告翻译 tool schema 可能导致 reserved label 风险（LLM 输出本地化选项标签绕过 enum 校验）。

## 决定

只翻译 `description` 类散文字段（tool description、param description、skill description），**不翻译 parameters 的字段名、type、enum 及任何 LLM 要输出或系统要匹配的值**。

## 为什么

查证 pi 0.79 自带工具（read/bash/edit/write）的 parameters schema：**零 `enum`、零 `reserved`、零严格匹配字段**。read 工具的参数就是 `path` / `offset` / `limit` 三个自由输入字段。reserved label 风险对 pi 自带工具不真实。

即使第三方扩展的 schema 含 enum，只要 pi-di18n 不碰 enum 字段、只改 description 散文，就不会破坏校验——description 是给 LLM 读的，不是 LLM 要输出的值。pi-tool-i18n 4 个版本也只改 description，从未碰 schema 字段，行为与本项目约束一致。

## 不做什么

不碰 `parameters.properties.*` 的 `name` / `type` / `enum` / `default`；不碰 tool 的 `name` 和 `label`；不碰 `RESERVED_LABEL` 类常量。

## 配套决策

默认关闭。改 LLM 输入是比 core-hacks（改 TUI 显示）更重的语义，让用户经 `/lang think` 显式 opt-in，理由是尊重用户对"改变 LLM 推理输入"的知情同意，而非风险。
