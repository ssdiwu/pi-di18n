# Pi 1.1.0 core-hacks 本地化兼容（进行中）

## 背景

pi-di18n 0.2.1 的兼容基线是 Pi 0.83.x，宿主已升级到 1.1.0（跨 0.x → 1.0 大版本）。按 AGENTS.md「每次 Pi 升级都从实际包版本和产物重新探测」的要求，对 core-hacks 锚点做了全量存活审计与分批更新。

- 宿主：`@earendil-works/pi-coding-agent` 1.1.0（2026-10-08 安装）
- 审计方法：zh-CN pack 全量 key 对照 1.1.0 dist 产物（含 `\u00b7` 转义解码后的运行时形态）；动态键位行确认 1.1.0 改为 `${keyDisplayText(...)}` 动态拼接。

## 2026-10-09 已完成

1. **第三方文案清除**：zh-TW core-hack 表中 chucknorris（38 条）、igotchu/yo（约 60 条，含 exact 与动态正则）全部移除；govern/oneliner 待 507 确认后再处理。
2. **zh-CN 静态锚点更新（9 条）**：
   - `No providers logged in. Use /login first.`（原 No OAuth providers…）
   - `Extra-high reasoning (~32k tokens)`（原 Maximum reasoning…）
   - `Horizontal padding for messages, tool output, and command output`
   - `Show transcript notices for cache costs and provider recovery diagnostics`
   - `Paste files on macOS, images, or text from clipboard`
   - `Global Resources` / `Project Local Resources`（原 Resource Configuration 拆分）
   - `  Type to filter · Enter to select · Esc to go back`、`  Enter to select · Esc to go back`（settings-submenu footer）
3. **动态模板锚点**：`Summarizing branch... (${keyText("app.interrupt")} to cancel)` 对齐 zh-TW 先例。
4. **回归测试分层**：`settings-localization.test.ts` 拆为 legacy（pi ≤0.83，其余 6 语言）与 1.1.0（zh-CN）两组。
5. **已删除的失效标题**：`Select color theme`（1.1.0 主题选择器不再使用该标题）。

验证：npm test 109/109；npm pack --dry-run 通过；Pi 1.1.0 RPC 实测加载零错误、`/lang` 命令注册正常。
**待办**：AGENTS.md 要求的真实 TUI `/lang debug`、`/lang probe` 与语言切换验证，需在交互式会话补做。

## 2026-10-09 第二批（运行时验证驱动的锚点校准）

**方法论修正**：静态源码比对存在大量假阳性——exact 替换作用在运行时渲染行上，动态键位行（`keyHint`/`keyDisplayText` 拼接）求值后往往与旧 key 一致。本批改用三个可靠信号：
1. **官方 probe 实测**（探针扩展读 `globalThis.__pi_i18n_probe__`）：Pi 1.1.0 下 9/9 patch 点 matched、slash 描述走 primary 模式、dist 目录探测正确——机制层完全兼容。
2. **运行时渲染复刻**：在 node 中以真实 `getKeybindings()` 求值复刻 1.1.0 组件的 hint 行拼接（如 tree help、LabelInput）。
3. **git diff 对照**：修正本批早期误覆盖的 4 条既有译文（`tab scope`/`Cache Re-billed:`/`Never trust`/`Fallback behavior…`）。

**结论性校准**（替代第一批的静态失配清单）：
- **存活确认**（无需改动）：tree help 七项（`↑/↓ move`、`←/→ page`、`shift+l label`、`shift+t label time`、`filters ctrl+d/t/u/l/a`、`cycle ctrl+o/shift+ctrl+o`）、session-selector 动作行（`ctrl+d delete`、`ctrl+n named`、`ctrl+r rename`、`ctrl+s sort`、`tab scope`、`escape/ctrl+c cancel`）、`Alt/Option+Enter queues follow-up…`（B 类两条，求值一致）、`Session-only. Ctrl+S to save to settings.`、`Current session: trusted/untrusted`、`Cached:`/`Uncached:`、`Configure llama.cpp with /login llama.cpp`、`/llama is available in interactive mode`。
- **键位/形态变更**（已更新）：`option+←/→ branch`（原 ctrl+←/→）、`ctrl+x copy`（新增）、`escape cancel`（原 escape/ctrl+c cancel）、`ctrl+p path on/off`（原带括号）、`Ctrl+S save`（原小写）、`✓ New session started`（原 Branched to new session）、`Nothing to compact (session too small)`、` ✓ configured`/` • not configured`（登录态行合并）。
- **确认移除**（已删除）：登录方式选项行（Use a subscription/Use an API key）、session 统计旧标签（Cache Read:/Cache Write:/Tool Results:）、`Saved decision: trusted/untrusted`、`Name: All`/`● All`、resource selector 旧 scope 行等约 25 条。

exact 表：300 → 288 条。npm test 109/109、npm pack --dry-run 通过。

**剩余待 TUI 实测确认**（静态无法判定，数量少）：`Reasoning depth for thinking-capable models`、`Select reasoning depth…`、`Move cursor / browse history (Up when empty)` 等 editor/thinking 键位描述；以及 AGENTS.md 要求的 `/lang debug`、`/lang probe` 与语言切换人工验证。

## 2026-10-10 第三批（根因修复：bundle 入口导致的 patch 全链失效）

**用户报告**：zh-CN 下 `/settings` 界面整屏英文（第二批曾误判为"机制层完全兼容"）。

**真正根因**：Pi 1.1.0 的实际入口是打包产物 `dist/bundle/cli.js`（`/opt/homebrew/bin/pi` 符号链接指向它），interactive TUI 的运行时类（`InteractiveMode`、`SettingsSelectorComponent`、`LoginDialogComponent`）定义在 `dist/bundle/chunks/chunk-OIM2DMFI.js` 内（形式 `InteractiveMode=class`，导出名未混淆）。而 `dist/modes/interactive/...` 下的独立文件是**运行时不加载的死副本**。di18n 的 `importFromPiCodingAgentDist` 全部 patch（showSelector/showStatus 分发、selector data-patch、login dialog）都打在死副本上——**probe 的 matched 全部是假象**（patch 确实"成功"写入了死对象的 prototype）。工具描述（think 线）不受影响，因为它工作在工具注册/prompt 层。

**证据链**（py-pty 驱动真实 TUI + 双探针）：
1. 扩展内 patch `dist/modes/interactive/interactive-mode.js` 的 `showSelector` → 打开 `/settings` 时 spy 零调用；直接在 dist 文件内插桩 → 主程序零调用（死文件实锤）。
2. 改 patch `dist/bundle/chunks/chunk-OIM2DMFI.js` 导出的类 → spy 每次都捕获，render 每帧调用。

**修复**（`src/core-hacks.ts`）：
- 新增 `importFromPiRuntime(relPath)` + `loadPiRuntimeChunk(distDir)`：检测 `dist/bundle/chunks/`（bundle 布局）后，扫描 chunk 文件内容（标记 `InteractiveMode=class`，类名未混淆、跨版本稳定）并动态 import，按 relPath→导出名映射（interactive-mode→`InteractiveMode`、login-dialog→`LoginDialogComponent`、settings-selector→`SettingsSelectorComponent`）返回包装模块。
- interactive-mode / login-dialog 的调用点改走 `importFromPiRuntime`（bundle 布局生效、旧布局回退原路径）。
- `BUILTIN_SLASH_COMMANDS` 在 bundle 中无命名导出：bundle 模式下 slash 主路径显式不可用，自动落入既有的 autocomplete 输出 fallback（`setSlashDescMode("fallback")`），不再出现"patch 死对象却报 primary"的假象。

**验证**：
- py-pty 真实 TUI：`/settings` 面板中文（自动压缩/编辑器内距上屏，英文标签消失）；`/model` scope 行中文。
- `scripts/tui-smoke.py`：把上述 pty 冒烟固化入库（可反复执行），当前 3/3 PASS。
- npm test 109/109；npm pack --dry-run 通过。

**注意**：第二批"probe 9/9 matched = 机制层完全兼容"的结论作废——probe 只证明钩子写入成功，不证明钩子位于运行路径。后续以 `scripts/tui-smoke.py` 为 TUI 层回归门槛。

## 2026-10-10 slash 描述本地化模式定案（方案 a）

**实测**：py-pty 打开 `/` 补全面板，`/session 显示会话信息与统计`、`/model 选择模型…` 中文描述上屏——autocomplete 输出层 fallback 在 1.1.0 真实生效（此前"primary 假象"随 bundle 修复一并澄清）。

**定案**：接受 fallback 为 Pi 1.1.0+ 的正式 slash 描述本地化路径。primary（改写 `BUILTIN_SLASH_COMMANDS`）在 bundle 布局下不可行（无命名导出、闭包内不可达），不再作为对齐目标。

**落地**：
- 启动提示从每会话 warning 降为一次性 info（`fallbackNoticeShown`），文案改为中性描述"运行于回退模式（经补全输出层翻译，功能完整）"。
- `/lang debug`、`/lang probe` 的 mode 展示保留（可诊断性不变）。
- 恢复 primary 仅在未来 pi 提供官方数据层钩子时重评。

## 剩余失配清单（51 条，2026-10-09 审计）

### A. 动态键位 footer 行（约 18 条）——建议 substr 片段方案

1.1.0 将 tree/resource selector 的提示行改为 `${keyDisplayText(keybinding)} 动作短语` 动态拼接，exact 整行匹配永久失效。建议把稳定英文片段（` · Esc to go back`、` to delete`、`filters` 等）作为子串条目加入 exact 表（applyExactMap 默认按子串 replaceAll，长 key 优先），或扩展 substr 专用通道。

涉及旧 key：`ctrl+d delete`、`ctrl+n named`、`ctrl+p path (off/on)`、`ctrl+r rename`、`ctrl+s save/sort`、`ctrl+←/→ branch`、`cycle ctrl+o/shift+ctrl+o`、`enter save/select`、`escape/ctrl+c cancel`、`filters ctrl+d/t/u/l/a`、`shift+l label`、`shift+t label time`、`tab scope`、`←/→ page`、`↑/↓ move`、`↑↓ navigate`。

### B. 动态模板行（2 条）

- `Alt+Enter queues follow-up messages…` / `Option+Enter queues…`：1.1.0 模板为 `${followUpKey} queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.`。实施前需确认 minified 产物中 `followUpKey` 变量名稳定性（当前 chunk 未压缩该名），再决定模板 key 或片段方案。

### C. 状态/标签/杂项（约 31 条）——逐条核对 1.1.0 新形态

`/llama is available in interactive mode`、`Configure llama.cpp with /login llama.cpp`、`• unconfigured`、`✓ command in models.json`、`✓ custom API key`、`✓ key in models.json`、`✓ logged in`、`✓ runtime API key`、`API key configured`、`subscription configured`、`Use a subscription`、`Use an API key`、`Branched to new session`、`Cache Read:`、`Cache Write:`、`Tool Results:`、`Tool output: collapsed/expanded`、`Current session: trusted/untrusted`、`Saved decision: trusted/untrusted`、`Move cursor / browse history (Up when empty)`、`Name: All`、`● All`、`New line (Ctrl+Enter on Windows Terminal)`、`Nothing to compact (no messages yet)`、`Reasoning depth for thinking-capable models`、`Select reasoning depth for thinking-capable models`、`Session-only. Ctrl+S to save to settings.`。

已知线索：`Branched to new session` 在 1.1.0 附近形态为 `✓ New session started`；OAuth 登录空态为 `No providers logged in. Use /login first.`（已修）；其余需按组件文件逐条定位。

## 其他语言 pack 边界

本轮仅更新 zh-CN。其余 6 语言（de/es/fr/ja/ko/pt-BR）保持 0.83 锚点，失配时安全回退英文，不劣于现状；补齐需逐语言翻译，另行安排。

## 守护

- `tests/settings-localization.test.ts`：legacy 组与其余 6 语言、1.1.0 组与 zh-CN 绑定；后续每批锚点更新需同步扩展该测试。
- 审计脚本思路：全量 key 对照 dist 产物字符串（模板串分段验证），可按需重写为 `scripts/` 内常规工具。

## 2026-10-19 维护复审修订

上述记录保留 `acf9902` 的首次适配判断。本轮补审确认 README 与 lockfile 仍保留 Pi 0.83 支持，因此不能只按 1.1.0 是否还显示某段文字删除语言锚点。已恢复远端基线中被删的 32 个 zh-CN 旧 exact 键，并保留本次新措辞；旧版设置描述的回归不再对 zh-CN 豁免。`tests/settings-localization.test.ts` 同时验证旧版和新版设置原文。

回退通知现改用既有 `I18nRegistry` 和维护语言包，不再把简体中文发送给所有语言。提示只说明命令描述走补全回退路径，不将该状态本身表述为“功能完整”。`tests/fallback-notice.test.ts` 从 `session_start` 入口核对维护语言中的实际通知；该测试隔离 patch 和预翻译边界，不访问个人状态或外部模型。
