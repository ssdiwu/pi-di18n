# pi-di18n — Agent 规范

## 文件职责与阅读顺序

- 本文件只记录 Pi 全量本地化扩展长期边界，不固定当前 Pi 小版本或发布步骤。
- 修改前读取 `README.md`、`doc/README.md`、`package.json`/lockfile、目标 core-hacks、locale registry、compaction 集成和测试；兼容基线以实际安装版本、类型与验证结果为准。

## 项目边界

- 项目承接 `pi-i18n` 并整合 compaction 本地化；TUI 按钮、selector、slash 描述和摘要语言保持同一 locale 真相源。
- `/lang` 与 `I18nRegistry` 管理 locale；子模块不得另建环境变量检测或平行缓存。
- 保留当前兼容事件名，删除或迁移前先核对真实消费者和跨版本测试。
- core-hacks 是对 Pi 内部实现的 best-effort patch，不是稳定公开 API；每次 Pi 升级都从实际包版本和产物重新探测，匹配失败安全降级。
- 不新增旧 scope 依赖、用户私有路径或密钥；本地化不得读取与语言选择无关的会话内容。

## TUI 与错误边界

- locale 状态、缓存和命令结果先于并独立于渲染；错误、警告、selector、overlay 或 slash patch 抛错时降级，不中断后续命令。
- 不把上游 TUI 异常吞成成功；保留可诊断但不含敏感内容的错误信号。
- 所有语言保持占位符、快捷键和语义覆盖一致；新增或修改文案必须有回归测试。
- 调试先建立目标 Pi 版本的最小失败信号；连续两次同类 patch 失败且范围未缩小时停止猜测并重读实际产物。

## 验证

```bash
npm test
npm pack --dry-run
```

涉及 core-hacks、slash 命令或 TUI patch 时，在真实 Pi 会话运行 `/lang debug`、`/lang probe` 和目标语言切换；未做真实 TUI 验证时明确说明。

## 文档与 Git

- locale 契约、兼容事件、patch 策略、支持语言或安装方式变化时同步 README 与对应 doc/ADR。
- `CHANGELOG.md` 只记录用户可感知变化。
- 未经用户明确要求，不执行 commit、push、tag 或 npm publish；不得强推受保护分支。
