# tests/

`pi-di18n` 的 vitest 回归测试。

| 文件 | 覆盖点 |
|------|--------|
| [module-load.test.ts](./module-load.test.ts) | 当前 `@earendil-works` pi 包下，扩展入口可正常加载。 |
| [extension-register.test.ts](./extension-register.test.ts) | 在隔离配置目录中执行 extension factory，确认 `/lang`、locale tool、默认工具覆盖和 compaction hooks 注册。 |
| [tool-override-exclusions.test.ts](./tool-override-exclusions.test.ts) | 过滤非法工具名，并确认让出的内置工具名不会被 pi-di18n 注册。 |
| [slash-i18n.test.ts](./slash-i18n.test.ts) | pi 0.81 全部内置 slash 命令（含 `/llama` 扩展命令）在 `en`/`zh-CN`/`zh-TW` bundle 有 key 且 en 基准同步上游，zh-CN/zh-TW 全部本地化。 |
| [core-hacks-slash.test.ts](./core-hacks-slash.test.ts) | 真实调用 `installCoreHacks()` patch pi 0.81 的 `BUILTIN_SLASH_COMMANDS`，验证 `slashDescMode=primary`。 |
| [compaction-locale.test.ts](./compaction-locale.test.ts) | 摘要本地化的 locale → 语言映射与语言指令。 |
| [compaction-templates.test.ts](./compaction-templates.test.ts) | `/compact` 与 `/tree` 摘要 prompt 模板。 |
| [compaction-failure.test.ts](./compaction-failure.test.ts) | compaction 确定性失败取消、可重试错误耗尽、错误分类、override 和 TUI 通知容错。 |
| [compaction-faux.test.ts](./compaction-faux.test.ts) | 使用 pi-ai faux provider 验证 `stopReason=error` 的重试与最终取消协议。 |
| [compaction-upgrade-compat.test.ts](./compaction-upgrade-compat.test.ts) | Pi 0.81–0.82 摘要兼容：header-only auth、provider env、usage、retry、no-cache 与独立 routing session。 |
| [settings-localization.test.ts](./settings-localization.test.ts) | pi 0.79 新增设置的语言包、zh-CN 行格式和 zh-TW legacy（设置条目本身在 0.81 仍适用）。 |
| [compaction-media.test.ts](./compaction-media.test.ts) | 富媒体 compaction 安全边界：大图片推进、完整 turn 保留、活动上下文重建验证。 |
| [cache-miss-notice.test.ts](./cache-miss-notice.test.ts) | 动态 cache miss notice 的分支解析、locale 模板和运行时数值保留。 |
| [cache-miss-notice-patch.test.ts](./cache-miss-notice-patch.test.ts) | `addCacheMissNotice` core patch：聊天区本地化与 TUI 异常 fail-soft。 |
| [model-i18n.test.ts](./model-i18n.test.ts) | Pi 0.81 `/model` 后台目录刷新状态文案的 zh-CN 本地化，保留动态 provider/计数值。 |
| [tool-output-status-i18n.test.ts](./tool-output-status-i18n.test.ts) | Pi 0.83 工具输出展开/折叠状态提示在全部维护语言包及 zh-TW legacy 路径中的本地化。 |
| [llama-custom-ui.test.ts](./llama-custom-ui.test.ts) | Pi 0.81 `/llama` `showExtensionCustom` 自定义组件 render 本地化与 render 异常 fail-soft 降级。 |
| [pi-082-083-i18n.test.ts](./pi-082-083-i18n.test.ts) | Pi 0.82/0.83 scoped-model、provider login 文案与 read/bmp think baseline。 |
| [login-dialog-i18n.test.ts](./login-dialog-i18n.test.ts) | provider 登录对话框动态文案本地化，以及 renderer 抛错时不打断登录。 |
| [think-auth.test.ts](./think-auth.test.ts) | `/lang think` 运行时翻译兼容仅请求头鉴权与 provider-scoped env。 |

运行：

```bash
npm test
```
