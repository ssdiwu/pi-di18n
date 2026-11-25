# 变更日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的基本格式。带 tag 的发布以 Git tag 为版本号；已发布版本由发布负责人负责维护英文 `CHANGELOG.md`，本文件是对应版本的中文镜像。两份日志只记录用户可感知事实，日常用中文记录，准备发布（release）时按版本同步到英文，并都随 npm 包发布。

新发布使用 `## [x.y.z] - YYYY-MM-DD` 格式的标题；条目可唯一对应 GitHub issue 时，在末尾附 `(#xx)`。历史条目保留原有标题格式。

## [0.2.4] - 2026-11-25

- 适配 Pi 1.6.0 的命令补全说明，并翻译 Anthropic 会话中途新增的工具描述。

## 0.2.3 - 2026-11-14

设置项值本地化、描述 token 清理，以及修复被污染的全局 think 默认值。文档重构（plan-first 布局，架构/规格/参考资料分离）。

### Fixed
- 修复修改值后设置行回退为英文的问题（例如 TUI 模式又显示 `fullscreen`）：存储值现在原样保留，只在渲染时翻译，因此循环切换值（Enter/Space）与子菜单预选仍然可用；此前值被就地翻译一次，导致第一次循环也出错（跳回第一个选项）。
- 修复本地化后的设置值比源 token 宽时被截断的问题：值渲染不再套用“保持原宽”保护，因为上游组件本身会把值截断到可用宽度。
- 把已翻译设置描述里的英文枚举 token（`'one-at-a-time'`、`'all'`、`'auto'`）替换为八种维护语言包中的本地化术语，与本地化的值行一致。
- 修复磁盘上全局 think 默认值被污染的问题：任何缓存写入都会把会话的运行时开关序列化进 `think.json`，因此某个会话里执行一次 `/lang think off`（或 0.2.2 之前的旧会话）会永久禁用所有未来会话，而会话级的 `/lang think on` 也无法修复。缓存写入现在只持久化磁盘级默认值，绝不写入会话开关。已损坏的文件需要一次性手工修复：在 `~/.pi/agent/state/pi-di18n/think.json` 中设置 `"enabled": true`。

## 0.2.2 - 2026-11-13

Pi 1.5.x 兼容更新。本扩展现在本地化整个 Pi 1.5.2 TUI（核心 UI、选择器、slash 命令、快捷键表、设置），并为九种维护语言提供完整词典。

### Fixed
- 修复 Pi 1.5.x 上完整 TUI 本地化静默失效的问题：slash 命令描述现在使用主补丁（bundle 把 `BUILTIN_SLASH_COMMANDS` 保持在内部，因此就地 patch `setupAutocompleteProvider` 构造的 provider），而不是回退到自动补全输出层。
- 修复 `I18nRegistry.t("pi.slash.<name>.description")` 对只提供带命名空间 key 的 bundle 无法解析的问题：注册的消息现在也以去掉前缀的名字存储。
- 修复长句（编辑器描述、prompt 免责声明）因 pi-tui 跨屏换行而永远匹配不到词典条目的问题：组件源文本现在在渲染前翻译。
- 修复由 `/bug` 等核心命令在 `showSelector` 之外打开的扩展 prompt 组件（`ExtensionEditorComponent`、`ExtensionSelectorComponent`、`ExtensionInputComponent`）仍为英文的问题。
- 修复 `/lang think on|off` 覆盖其他所有会话全局开关的问题：开关现在按会话生效，`think.json` 中的全局默认值每个会话读取一次。默认值现在是**开启**；缺失、损坏或缺少字段的 `think.json` 不再静默禁用它。
- 修复 bash 工具覆盖丢弃用户配置的 `shellPath` 的问题：本地化重建现在每次执行都从 `pi.getSettings()` 转发有效设置，而不是静默忽略 ([#6](https://github.com/ssdiwu/pi-di18n/issues/6))。
- 修复 zh-TW 忽略自带词典的问题：运行时现在先应用旧规则（它们携带“73 calls, 73 results”这类动态文本的正则规则，key→value 包无法表达），再应用精确包，因此动态文本与新加的静态字符串都会本地化。
- 修复 `ja`、`ko`、`de`、`fr`、`es`、`pt-BR` 中约 30 个值与 key 相同的词典条目（`Theme`→`Theme`、`auto`→`auto` 等）。精确映射过滤器会丢弃这类条目，导致这些 UI 字符串回退为英文。

### Added
- 本地化 Pi 1.5.x 新增内容：`/thinking` 与 `/bug` slash 命令（替换已移除的 `/llama`）、选择器提示行（`Enter to select · Esc to go back`、`Enter/Space to change`、`Type to filter`）、`/hotkeys` 表格行、1.1 以来新增的设置行（缓存预热、session share 目标、Mermaid 图、静默启动等）及其枚举值。
- 新增 `tests/pi-15x-compat.test.ts` 固定 Pi 1.5.x 兼容行为，并新增核心 hacks 词典包的契约测试。

### Changed
- 从每种语言 bundle 移除 `/llama` slash 描述：Pi 1.5.x 中该命令已不存在。
- 把所有语言 bundle 中重复的 `slash.*` / `pi.slash.*` 描述 key 合并为带命名空间的形式。
- 让 `ja`、`ko`、`de`、`fr`、`es`、`pt-BR` 的核心 hacks 词典与 zh-CN key 集对齐（每种语言补齐 148 条，使用本地 UI 术语），并发布新的 `src/core-hacks-locales/zh-TW.json` 精确包（378 条），基于 zh-CN 使用台湾地区在 provider、session、设置、流式与空闲方面的术语构建；`en` 按设计保持为空。
- README 中的兼容基线从 0.83.x 更新为 1.5.x；仍支持更早的基线。

### Added (from #7)
- zh-CN 同时保留旧版（Pi ≤0.83）与 1.1.0 设置锚点，其他维护语言包保留旧锚点，等待新文案补齐。
- 按 Pi 1.1.0 运行时行为校准 zh-CN 锚点：确认动态快捷键提示行（`↑/↓ move`、`ctrl+d delete`、`filters …`）仍解析到 zh-CN 锚点，更新改写或换 key 的文案（`option+←/→ branch`、`ctrl+x copy`、`Ctrl+S save`、`✓ New session started`、`Nothing to compact (session too small)`、` ✓ configured` / ` • not configured` 登录状态行），同时保留受支持旧宿主所需的旧锚点。

### Fixed (from #7)
- 恢复受支持旧版本的 zh-CN UI 锚点及新 Pi 文案，并恢复旧设置回归检查，而不是对 zh-CN 豁免。
- 让 slash 回退通知走当前语言 bundle，而不是总显示简体中文。
- 恢复第三方命令的运行时自动补全描述缓存命中，同时保留 Pi source 标签，包括带 scope 的 npm 包与 git 引用。
- 新增 `scripts/tui-smoke.py`（基于 pty 的真实 TUI 冒烟测试）作为 TUI 层回归门禁；仅 `matched` 探测状态不再被视为本地化的证据。
- 本地化 Pi 1.1.0 新增设置（模型默认思考档位、TUI 模式、全屏退出输出 / 滚动条 / 选中复制 / 滚轮滚动标签与描述），并把 slash 回退警告翻译成中文。


## 0.2.1 - 2026-07-30

### Added
- 本地化 Pi 0.83 的工具输出展开状态通知（`Tool output: expanded` 与 `Tool output: collapsed`），覆盖所有维护的 TUI 语言。

### Fixed
- 在本地化 `/compact` 与 `/tree` 流程中恢复 Pi 0.81–0.82 的摘要语义：仅 header/provider-env 认证、用量统计、有界的瞬时重试，以及隔离的无缓存路由 session ID。
- 本地化 Pi 0.82/0.83 不可用的带 scope 模型行与 OpenRouter/Kimi 登录提示，登录对话框渲染失败时安全降级。
- 刷新预填的 `read` 工具描述基线以支持 Pi 的 `bmp` 图片格式。

### Changed
- 把开发兼容基线升级到 `@earendil-works/pi-coding-agent` 0.83.x。

## 0.2.0 - 2026-07-21

### Added
- 本地化 Pi 0.81 内置 `/llama` 扩展命令描述（`pi.slash.llama.description`、`slash.llama.description`）以及通过 `showExtensionCustom` 渲染的 `/llama` 自定义模型管理 UI。
- 本地化 Pi 0.80.8+ `/model` 后台目录刷新状态消息（`Refreshing model catalogs…`、`Model catalogs refreshed.`、刷新超时/失败通知），同时保留动态 provider ID 与目录数量。修补 `ModelSelectorComponent.updateList`，让动态添加的刷新状态 Text 节点在每次渲染时重新本地化。
- 新增 `slash.llama.description` 旧格式 key，使 `I18nRegistry.t("pi.slash.llama.description")` 正确解析，并在翻译扩展命令描述时保留自动补全 source 标签（`[t]`/`[u]`）。

### Changed
- 把 `/reload` slash 描述基线同步到 Pi 0.81（`Reload keybindings, extensions, skills, prompts, themes, and context files`），覆盖 `en`、`zh-CN`、`zh-TW`。
- 修补 `InteractiveMode.showExtensionCustom`，让自定义扩展 UI 组件（如 `/llama`）的渲染行逐行本地化；渲染失败时安全降级，绝不拒绝宿主的自定义 UI Promise。
- 把开发基线升级到 `@earendil-works/pi-coding-agent` 0.81.0，并把 compaction 导入迁移到 `@earendil-works/pi-ai/compat`。

### Added
- 新增 `disabledBuiltinToolOverrides`，让其他扩展可以接管选定的 `read`、`bash`、`edit` 或 `write` 工具名，而不必禁用 pi-di18n 的其余部分。

### Tests
- 隔离扩展注册与真实用户状态，并覆盖选择性内置工具覆盖排除。

## 0.1.8 - 2026-07-16

### Changed
- **可读的工具结果投影**：`i18n_get_locale` 现在提供本地化的折叠与展开文本投影；折叠形式使用实际快捷键提示，展开形式显示解析来源、回退（fallback locale）与内置 UI 语言包，而不是直接展示结构化 `details`。
- **Pi 0.80 `/session` 本地化**：完成工具、缓存详情、token 与缓存重计费标签的翻译，中文 UI 不再混杂英文统计文本。

## 0.1.7 - 2026-07-13

### Tests
- 新增回归测试，证明 locale/模板格式化抛错时，上游 cache-miss 通知仍会运行且可见。

## 0.1.6 - 2026-07-13

### Fixed
- 加固动态 cache-miss 通知本地化，使快照、模板、ANSI 变更与渲染器失败都不会阻止上游通知方法运行，也不会逃逸到主 session。

### Tests
- 新增精确的 zh-CN/zh-TW 空闲与模型切换断言、ANSI 保留覆盖与上游调用失败降级回归。

## 0.1.5 - 2026-07-13

### Fixed
- 防止超大图片与音频 payload 越过 compaction 保留边界；完整工具轮次移入摘要，不安全边界取消而不是回退。
- 本地化模型切换与空闲间隔的运行时 cache-miss 通知，同时保留 token、分钟与成本值；TUI 渲染失败时安全降级。

### Tests
- 新增真实 pi 0.79 分轮 compaction 重建覆盖，以及 cache-miss 通知解析器/patch 回归覆盖。

## 0.1.4 - 2026-07-13

### Fixed
- 防止失败的 compaction 摘要回退到当前会话模型发起第二次请求；新增 provider/模型诊断、错误分类与 pi 0.79 `Cache miss notices` / `Output padding` 本地化覆盖。

## 0.1.3 - 2026-06-25

### Fixed
- 停止同一 locale 重载时（例如 `/lang` 再次选择当前语言、`/reload` 或扩展热重载）间歇出现的“slash 命令本地化正在回退模式运行”误报警告。同一 locale 重装核心 hacks 是幂等的，现在正确报告 `primary`，不再把已本地化命令误计为未变化。

## 0.1.2 - 2026-06-19

### Fixed
- 加固 `showError` / `showWarning` 核心 hacks 补丁，使上游瞬时失败（例如 pi 升级后的 `Spacer is not defined`）降级为 stderr 回退，而不是升级为杀死 pi 进程的 `uncaughtException`。降级记录在 `interactive.showError` / `interactive.showWarning` 探测点，状态为 `unsafe`，因此 `/lang probe` 可以显示它。
- 补齐 `zh-CN` 在 `core-hacks` 中剩余的 selector 缺口，特别是真实 TUI 截图中报告的模型、设置、tree、登录、登出、信任与恢复选择器。
- 新增 ANSI 感知的行归一化，让 `Scope: all | scoped`、`tab scope (all/scoped)`、`Model Name`、`Resume Session` 等带颜色的 selector 行在真实 pi 会话中正确本地化。
- 本地化 `zh-CN` 设置行 `Default project trust`、`Warnings` 及相关描述/值，同时不破坏 `configured` 等英文源字符串。
- 本地化 `/export`、`/import`、`/copy`、`/share` 的运行时错误与用量通知，包括交互模式渲染的上游 `Error:` 前缀。
- 收紧短值翻译（`Ask`、`configure`、`Always trust`、`Never trust`）为仅整行匹配，避免通用子串泄漏到无关的 UI 文本。

## 0.1.1 - 2026-06-18

### Fixed
- 明确启动状态通知，让用户能看到 `/lang think` 是否启用。
- `/lang think on` 与 `/lang think off` 后立即刷新语言/think 状态通知。
- 让 `zh-TW` 的启动状态文案更自然。
- 隔离测试状态与真实用户状态，测试运行不再覆盖 `~/.pi/agent/state/pi-di18n/think.json`。

### Changed
- 新增共享状态路径 helper，让 `think` 缓存、UI 缓存、配置与 compaction 配置使用同一个可覆盖的 state root。

## 0.1.0 - 2026-06-18

### Added
- 发布 `pi-di18n` 作为 pi 本地化扩展，覆盖完整 TUI 本地化、`/lang think` 工具描述本地化与 compaction 摘要本地化。
- 新增 pi 0.79 内置 slash 命令描述本地化，包括 `zh-CN`。
- 新增扩展、prompt 模板与 skill 命令描述的运行时本地化。
- 新增 12 种 `/lang think` 目标语言的基础翻译。

### Fixed
- 关闭核心 hacks 时把 slash 描述恢复为原始英文文本。
- slash 描述本地化从仅 `zh-TW` 改为所有非 `en` locale。
