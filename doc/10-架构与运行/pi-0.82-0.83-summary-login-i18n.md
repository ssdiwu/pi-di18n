# Pi 0.82–0.83 摘要与登录本地化兼容

## 上游变化

Pi 0.81–0.83 对 pi-di18n 的扩展接管路径带来四类变化：

- 0.81.0 将 compaction、branch summary 和工具调用的 provider usage 纳入会话统计；
- 0.81.1 为 compaction / branch summary 增加瞬态失败重试；
- 0.82.0 为一次性摘要请求使用独立 routing session，并禁用不可复用的 prompt-cache 写入；
- 0.82.1 支持完全解析为请求头的鉴权，并在 scoped-model selector 中展示不可用配置；
- 0.82–0.83 新增 Kimi Code、OpenRouter 及远程/headless 登录文案。

pi-di18n 通过 `session_before_compact` / `session_before_tree` 自行生成本地化摘要，因此不会自动继承 Pi core 的摘要实现变化；`core-hacks` 同样需要显式覆盖新增 TUI 文案和直接挂载到 editor container 的登录对话框。

## 本项目适配

### 摘要请求

`src/compaction/summarize.ts` 现在：

- 接受 Pi session resolver 返回的 API key、header-only auth 和 provider-scoped env；
- 将 provider response 的 `usage` 放入 extension summary 返回体；
- 复用 Pi 公开的 `retryAssistantCall`，对瞬态 provider / transport 失败做有界指数退避，确定性 auth、model 与 quota 错误不重试；
- 为每次摘要操作生成新的 UUIDv7 routing session，并设置 `cacheRetention: "none"`；
- 最终失败仍返回 `{ cancel: true }`，不允许 Pi core 再发起一套英文摘要请求。

`src/think/translator.ts` 使用同样的鉴权边界，使 `/lang think` 的运行时 fallback 能在 Kimi OAuth、`ANTHROPIC_AUTH_TOKEN` 等仅请求头场景工作。

### TUI

`core-hacks` 新增以下表面：

- scoped-model selector 的 `[unavailable]`、`Model unavailable`、数量与保存提示；
- OpenRouter/Kimi 登录方式标签；
- OpenRouter headless redirect URL / authorization code 提示；
- `LoginDialogComponent` 独立 render patch，因为该组件不经过 `showSelector`。

登录对话框 render 调用有独立容错边界：上游渲染异常时返回空更新并记录 probe `interactive.loginDialog.render=unsafe`，不改变 OAuth 状态、输入 Promise 或命令结果。

`No models match pattern ...` 也进入语言包，能覆盖 extension 安装后的 warning 路径；但 Pi 启动时会在加载 extension 前解析 scoped-model 设置，因此失效配置导致的首条启动 warning 仍可能由上游直接以英文输出，`core-hacks` 无法追溯改写已经写出的终端内容。

### Think baseline

Pi 当前 `read` 工具支持 `bmp` 图片。`src/think-locales/*.json` 的英文源和 12 个目标语言已同步该格式，避免英文原文失配后不必要地进入运行时翻译。

## 回归证据

- `tests/compaction-upgrade-compat.test.ts`
- `tests/think-auth.test.ts`
- `tests/pi-082-083-i18n.test.ts`
- `tests/login-dialog-i18n.test.ts`

真实 Pi TUI 复测至少覆盖：

```text
/lang zh-CN
/scoped-models
/login openrouter
/lang debug
/lang probe
```
