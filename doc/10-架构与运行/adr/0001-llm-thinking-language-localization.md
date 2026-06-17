# LLM 思考语言本地化走运行时翻译路线

## 背景

pi-di18n 要让 pi 发给 LLM 的 prompt 自适应用户 locale（tool/param/skill description）。翻译来源有两条路线：bundle 预制（离线 LLM 翻译进 `locales/*.json`）vs 运行时 LLM 翻译（用户首次用时翻）。

## 决定

对 tool/param/skill description 采用**运行时 LLM 翻译 + 落盘缓存**路线，辅以预制 bundle 作为首选查询源。第一版翻译用 session 当前模型，不做多模型配置。

## 为什么

两条路线的翻译来源相同（都是 LLM 翻译），区别在"什么时候翻 + 能覆盖什么"：

- **语言覆盖**：用户 locale 任意（中文、日文…）。bundle 预制无法预知所有语言；运行时翻译按 locale 自然支持任意语言。
- **工具覆盖**：用户 session 的工具集是动态的（pi 自带 + 第三方扩展 + `~/.agents/skills/` 自定义 skill）。bundle 在开发期无法知道用户会装什么扩展，预制不了第三方 description；运行时扫描 `pi.getAllTools()` 才能覆盖全部。

这两条都是"自适应任意用户语言"诉求的硬性约束，bundle 路线无法满足。

落盘缓存是必须的：`before_provider_request` 每轮对话都触发，不缓存 = 每轮重翻所有 description = token 成本爆炸 + 翻译漂移。缓存命中后零成本、翻译稳定。

## 不做什么

- pi 核心行为指令（system prompt 本体）暂不翻译——它动态拼装、实时翻译成本高且 pi 升级必断；改用一句 locale 指令注入达成思考语言切换。
- 多模型配置——配置越多摩擦越多，第一版用 session 当前模型即可，未来按真实痛点再加。
