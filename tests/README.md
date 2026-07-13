# tests/

`pi-di18n` 的 vitest 回归测试。

| 文件 | 覆盖点 |
|------|--------|
| [module-load.test.ts](./module-load.test.ts) | 当前 `@earendil-works` pi 包下，扩展入口可正常加载。 |
| [extension-register.test.ts](./extension-register.test.ts) | 执行 extension factory，确认 `/lang`、locale tool、工具覆盖、compaction hooks 注册。 |
| [slash-i18n.test.ts](./slash-i18n.test.ts) | pi 0.79 全部内置 slash 命令在 `en`/`zh-CN` bundle 中有 key，且 zh-CN 全部本地化。 |
| [core-hacks-slash.test.ts](./core-hacks-slash.test.ts) | 真实调用 `installCoreHacks()` patch pi 0.79 的 `BUILTIN_SLASH_COMMANDS`，验证 `slashDescMode=primary`。 |
| [compaction-locale.test.ts](./compaction-locale.test.ts) | 摘要本地化的 locale → 语言映射与语言指令。 |
| [compaction-templates.test.ts](./compaction-templates.test.ts) | `/compact` 与 `/tree` 摘要 prompt 模板。 |
| [compaction-failure.test.ts](./compaction-failure.test.ts) | compaction 单次失败取消、错误分类、override 和 TUI 通知容错。 |
| [compaction-faux.test.ts](./compaction-faux.test.ts) | 使用 pi-ai faux provider 验证 `stopReason=error` 正常 resolve 协议。 |
| [settings-localization.test.ts](./settings-localization.test.ts) | pi 0.79 新增设置的语言包、zh-CN 行格式和 zh-TW legacy。 |

运行：

```bash
npm test
```
