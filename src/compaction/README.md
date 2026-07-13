# src/compaction/

摘要本地化模块（整合自 pi-compaction-i18n）。

## 职责

接管 pi 的 `/compact`（上下文压缩）与 `/tree`（分支切换）摘要生成，输出**本地化**的 markdown 摘要。

## 与 pi-i18n 的整合差异

pi-compaction-i18n 原本独立读环境变量 / 独立 config 决定 locale。并入 pi-di18n 后，**locale 真相源统一为 `i18n.getLocale()`**（即 `/lang` 当前选择的语言），由 `index.ts` 的事件处理器传入。

本模块只保留与 locale 解耦的纯逻辑：

| 文件 | 说明 |
|------|------|
| [locale.ts](./locale.ts) | locale → 语言码映射 + 语言写作指令（11 语言） |
| [templates.ts](./templates.ts) | 本地化摘要 markdown 模板（章节标题翻译） |
| [summarize.ts](./summarize.ts) | 事件处理器：`session_before_compact` / `session_before_tree` |

## 可选 model override

摘要用的 LLM 模型默认跟随当前会话；可在 `~/.pi/agent/state/pi-di18n/compaction.json` 配置 `model`（`provider/modelId`）覆盖。

总结请求失败时，扩展会记录实际 `provider/model` 并将错误分类为模型不可用、认证失败、usage/quota、限流、网络、取消或未知；随后返回 `{ cancel: true }`，阻止 pi core 使用当前会话模型重复请求。成功摘要的 `details` 也包含实际 `provider` 和 `model`。
