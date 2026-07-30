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

摘要鉴权优先使用 Pi 的会话级 resolver，兼容 API key、仅请求头鉴权和 provider-scoped env。成功结果会回传 provider usage，纳入 footer 与 `/session` 统计；每次摘要使用独立 routing session 并禁用不可复用的 prompt-cache 写入。瞬态 provider / transport 错误复用 Pi 公开的 `retryAssistantCall` 做有界指数退避，确定性模型、认证和额度错误不重试。最终失败仍返回 `{ cancel: true }`，阻止 pi core 再用当前会话模型发起第二套摘要请求。成功摘要的 `details` 保留实际 `provider` 和 `model`。

## 富媒体保留边界

`session_before_compact` 会扫描 pi core 提供的保留区；如果完整 turn 中含超过 512 KiB 的图片或音频 payload，就把 `firstKeptEntryId` 推进到该 turn 之后的 user 边界，再将被移出的完整 turn补入摘要输入。这样 JSONL 原始媒体不被删除，但 compaction 后由 `buildSessionContext` 重建的活动上下文不再携带大 payload，也不会留下孤立的 tool call/result。无安全 user 边界时取消本次压缩，不让 pi core 使用当前会话模型兜底。
