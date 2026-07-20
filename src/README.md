# src/

`pi-di18n` 的扩展运行时代码。

| 文件/目录 | 说明 |
|-----------|------|
| [core-hacks.ts](./core-hacks.ts) | core-hacks：patch pi 内部 TUI 渲染路径、slash 命令描述和动态 cache miss 提示。 |
| [cache-miss-notice.ts](./cache-miss-notice.ts) | cache miss 动态文案的分支解析、locale 模板格式化与 ANSI 安全处理。 |
| [pi-ui.ts](./pi-ui.ts) | 工具 UI、按钮、输出渲染本地化。 |
| [registry.ts](./registry.ts) | i18n bundle registry 与 `t()` 翻译 API。 |
| [config.ts](./config.ts) | `/lang` 配置读取、保存、环境 locale 检测，以及同名内置工具覆盖的排除列表。 |
| [probe.ts](./probe.ts) | core-hacks 运行时探针。 |
| [types.ts](./types.ts) | i18n bundle/API 类型定义。 |
| [compaction/](./compaction/) | `/compact` 与 `/tree` 摘要本地化。 |
| [think/](./think/) | B 线：LLM 思考语言本地化。 |
| [think-locales/](./think-locales/) | B 线随包发布的 tool/param description 预制 baseline 数据，不包含运行时逻辑。 |
| [ui-localize/](./ui-localize/) | A 线 runtime UI description 本地化：扩展/技能/提示词命令说明异步翻译与缓存。 |
| [core-hacks-locales/](./core-hacks-locales/) | core-hacks exact/substring 翻译包。 |

## 注意

- 不要绕开 core-hacks；TUI 全量 i18n 依赖它。
- `pi-i18n/requestApi` 与 `pi-core/i18n/requestApi` 事件名保持兼容，不因项目改名而改动。
- compaction locale 必须从 `i18n.getLocale()` 传入，避免 TUI 与摘要语言不一致。
- A 线 runtime UI localizer 只翻用户可见 command/autocomplete description；不要混用 B 线 `/lang think` 的 LLM-facing payload 翻译。
- 其他扩展需要拥有 `read` / `bash` / `edit` / `write` 时，通过 `disabledBuiltinToolOverrides` 逐项让出工具名；不要靠包加载顺序处理冲突。
