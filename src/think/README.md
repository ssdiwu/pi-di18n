# src/think/

**B 线 - 思考语言本地化**:让 pi 发给 LLM 的 tool/param description 自适应用户 locale,使 LLM 倾向用目标语言思考。

> 给 LLM 看(区别于 A 线 core-hacks 给人看 TUI、C 线 compaction 给人看摘要)。

## 模块

| 文件 | 职责 |
|------|------|
| `types.ts` | 类型:`ThinkCache`、`ThinkEntry`、`DescribeItem` |
| `baseline.ts` | 加载随包预制 baseline(`src/think-locales/*.json`),三层翻译源第1层 |
| `cache.ts` | 读写 `~/.pi/agent/state/pi-di18n/think.json`（测试可用 `PI_DI18N_STATE_DIR` 覆盖）,第2层。每条带英文原文做失效比对 |
| `describe.ts` | 从 `pi.getAllTools()` 收集 tool/param 英文 description(待翻译字面量) |
| `translator.ts` | LLM 批量翻译,复用 compaction 的 `complete()` + `resolveModelAuth` 模式,第3层 |
| `localize.ts` | 核心编排:三层查询、`session_start` 预翻译、`before_provider_request` 替换、`/lang think` 命令 |

## 数据流

```
session_start      → prefetchOnSessionStart(异步预翻译,不阻塞)
before_provider_request → applyOnProviderRequest(三层查询替换;缓存 miss 同步兜底)
/lang think on|off|doctor|clear → commandThink(开关、诊断、缓存清理)
```

三层翻译源（顺序固定）：① 预制 baseline → ② 翻译缓存（en 原文比对）→ ③ 同步 LLM 翻译兜底。

provider payload 覆盖：

- OpenAI-style：`tools[].function.description` + `function.parameters.properties.*.description`
- Anthropic：`tools[].description` + `input_schema.properties.*.description`
- Google/Gemini：`tools[].functionDeclarations[].description` + `parametersJsonSchema.properties.*.description`

## 关键约束

- 只翻译 description 散文,不碰字段名 / type / enum / 值(ADR 0002)。
- 翻译用 session 当前模型,不配置(ADR 0001)。
- 默认关,`/lang think on` 显式开启;语言跟随 `/lang` 的 locale(ADR 决策 12)。
- `/lang think doctor` 报告 baseline 覆盖、缓存条数、过期条数、pending 条数。
- `/lang think clear` 清当前 locale 缓存,`/lang think clear-all` 清全部 locale 缓存。
- 预制 baseline 覆盖 12 语言(ADR 0003),其余走运行时兜底。

详见 [doc/30-路线图/路线图.md](../../doc/30-路线图/路线图.md)、[doc/10-架构与运行/adr/](../../doc/10-架构与运行/adr/)。
