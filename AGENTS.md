# pi-di18n — Agent 规范

## 文件职责与阅读顺序

- 本文件只记录 Pi 全量本地化扩展的长期工程与交付边界，不固定当前 Pi 小版本、词包条目数或发布状态。
- 修改前按任务读取：入口 `README.md` 与 `doc/README.md`；A 线 `src/README.md` + `doc/10-架构与运行/`（当前架构权威）+ 目标 core-hacks 代码；B 线 `src/think/README.md` + 对应 ADR；C 线 `src/compaction/README.md`；词包改动先读 `doc/10-架构与运行/12-词典包与词包契约.md`；测试入口 `tests/README.md`。当前行为以实际代码、类型与验证结果为准。
- `doc/90-归档/` 只提供历史背景；被覆盖的方案、旧版本适配记录和过期验证不得作为当前实现权威。

## 项目边界

- 项目承接 `pi-i18n` 并整合 `pi-compaction-i18n` 摘要本地化；TUI 按钮、selector、slash 描述和摘要语言保持同一 locale 真相源：`/lang` 与 `I18nRegistry`。子模块不得另建环境变量检测、平行 locale 状态或第二套缓存。
- 三条线各管一类受众：A 线 TUI（人）、B 线思考语言（LLM payload description）、C 线摘要（人）；机制见 `doc/10-架构与运行/10-系统架构.md`，不得互相混用管道（如把 B 线 payload 翻译混进 A 线 UI 缓存）。
- 保留 `pi-i18n/requestApi`、`pi-core/i18n/requestApi` 等兼容事件名，删除或迁移前先核对真实消费者和跨版本测试。
- core-hacks 是对 Pi 内部实现的 best-effort patch，不是稳定公开 API；每次 Pi 升级都从实际包版本和 dist 产物重新探测，匹配失败安全降级，不猜测模块路径。
- 只翻译用户可见 UI 与 LLM-facing description 散文；不读取与语言选择无关的会话内容，不新增旧 scope 依赖、用户私有路径或密钥。
- 磁盘状态文件（`think.json`/`ui.json`/`config.json`）职责单一：`think.json` 的 `enabled` 是全局默认，会话内 `/lang think on|off` 只改本会话内存；任何缓存落盘都不得把会话运行时开关序列化进磁盘全局默认。

## TUI 与错误边界

- locale 状态、缓存和命令结果先于并独立于渲染；错误、警告、selector、overlay 或 slash patch 抛错时降级（回退英文或跳过该 UI 更新），不中断 `/lang`、locale 切换或后续命令。
- 不把上游 TUI 异常吞成成功；保留可诊断但不含敏感内容的错误信号（probe/debug 可读）。
- 翻译管道不得改变语义完整性：占位符、快捷键、枚举值循环切换和子菜单预选依赖的原始值必须保持原文（值渲染时翻译、渲染后还原）。
- 所有语言保持占位符、快捷键和语义覆盖一致；新增或修改文案必须有回归测试，词包键集契约见 `doc/10-架构与运行/12-词典包与词包契约.md`。

## 工程与失败恢复

- 调试先建立目标 Pi 版本的最小失败信号（`/lang debug`、`/lang probe`、`scripts/tui-smoke.py`、可重放的 dist 对照）；连续两次同类 patch 失败且范围未缩小时停止原路径，重读实际产物与现行架构文档。
- 上游措辞变更走「新增当前措辞 key、保留旧措辞 key、分层测试守护」；上游删除的功能同步删 key 并在测试中断言不回流。
- 上游组件已有排版逻辑时（按剩余宽度截断值、折行长句），翻译管道不得提前限宽或改写排版假设；先核对渲染责任归属再选翻译层级（源文本/行级/值级）。
- `index.ts` 保持组合入口；`src/` 按三线真实边界组织（core-hacks/ui-localize、think、compaction），只有稳定重复或明确契约时才新增层。

## 验证

按改动范围逐级运行：

```bash
npm test
npm pack --dry-run
node scripts/verify-core-hacks-locales.mjs --check
```

涉及 core-hacks、slash 命令或 TUI patch 时，另跑 `python3 scripts/tui-smoke.py`，并在真实 Pi 会话执行 `/lang debug`、`/lang probe` 和目标语言切换；未做真实 TUI 验证时明确说明。

Pi 升级后先跑全套验证再改锚点；自动测试、词典对齐、TUI 冒烟与真实会话行为是不同证据，不互相代替。

## 文档与 Git

- locale 契约、兼容事件、patch 策略、三线机制、支持语言或安装方式变化时，同步 README、对应架构文档与必要 ADR；文档沉淀出口见 `doc/README.md`（术语 → 术语表，难逆转权衡 → 决策档案，可复用做法 → 经验笔记）。
- `CHANGELOG.md` 只记录用户可感知变化，不写验证日志或内部推翻过程；验证记录落 `doc/40-版本实施方案/`。
- 未经用户明确要求，不执行 commit、push、tag 或 npm publish；不得强推受保护分支。
