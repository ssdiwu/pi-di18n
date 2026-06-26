# pi-di18n Agent 规范

## 项目定位

`pi-di18n` = `pi-i18n` 接手演进 + `pi-compaction-i18n` 摘要本地化整合。

必须保留 core-hacks。TUI 全量 i18n（含按钮文字、selector、slash 命令描述）是本项目核心目标，不允许绕开 core-hacks 另起轻量方案。

## 关键约束

- 目标 pi 版本基线：`@earendil-works/pi-coding-agent` 0.79.x。
- 依赖 scope 使用 `@earendil-works/*`，不要新增 `@mariozechner/*` 依赖。
- `pi-i18n/requestApi` 与 `pi-core/i18n/requestApi` 是兼容事件名，保留不改。
- `locale` 真相源由 `/lang` 和 `I18nRegistry` 管理；compaction 模块从 `i18n.getLocale()` 接收 locale，不再独立检测环境变量。
- core-hacks 是 best-effort patch，每次 pi 升级必须复测。

## TUI 边界防护

- `core-hacks`、`patchedShowError`、`patchedShowWarning`、selector / slash 描述等 TUI patch 路径必须按“不信任 Pi 主程序渲染层”设计。
- 遇到 `Spacer is not defined` 或其它上游 TUI 组件异常时，扩展只能降级显示或跳过该 UI 更新，不能让 `/lang`、错误提示、locale 切换或后续命令中断。
- UI patch 的状态更新、缓存写入和命令结果不能和 TUI 渲染放在同一个未保护代码块里；渲染调用必须有 `try/catch` 或等价容错边界。
- 涉及错误/警告展示、overlay、selector 或 slash 命令描述的改动，必须补“UI 渲染抛错仍不影响业务返回”的回归测试；真实 Pi TUI 再 smoke test。

## 验证要求

改动后至少运行：

```bash
npm test
npm pack --dry-run
```

涉及 TUI patch、slash 命令、core-hacks 时，还需要在真实 pi 会话中运行：

```text
/lang debug
/lang probe
```

重点观察：`coreDist`、`slashDescMode`、`probe` 的 matched/hit/translated。

## 发版流程

版本号遵循语义化版本。发版步骤固定为：

1. 同步版本号：`package.json` + `package-lock.json`（根 `version` 与 `packages[""].version` 两处）。
2. `CHANGELOG.md`：把 `## Unreleased` 转为 `## <版本号> - <日期>`，顶部补回空的 `## Unreleased` 段。
3. 确认 tag、`package.json` 版本号、`CHANGELOG` 版本段三者一致。
4. 运行验证：`npm test` + `npm pack --dry-run`。
5. 提交：`fix:` / `feat:` 类型 + 中文描述，单一主题。
6. 打 tag：`git tag v<版本号>`（与版本号一致）。
7. 发布：`npm publish`（`publishConfig.access` 已为 `public`）。
8. 推送：`git push && git push --tags`。

禁止 `git push --force` 到 `main`。

## 文档沉淀出口

三个沉淀出口按边界分工，不混用：

- **`doc/术语表.md`** — 回答"这个词指什么"，收项目特有概念；定义"是什么"，不沾实现细节。惰性创建，术语敲定时当场写。
- **`doc/决策档案/`** — 回答"为什么这么定"，只收"难逆转 + 无上下文会困惑 + 有真实权衡"的决策（刻碑，记了就不删）。一条一文件，顺序编号 `0001-中文标题.md`（项目术语沿用术语表规范叫法）；维护 `README.md` 索引（编号 + 标题 + 一句话主旨），新增 / 更新 ADR 时同步。
- **`doc/经验笔记.md`** — 回答"这事儿怎么做"，收可改的做法与避坑经验（活页）。门槛：解决一个坑时，如果换一个无上下文的 agent 来会重走一遍，就值得记。格式：现象 + 做法 + 证据。重复发生时在原条目追加证据，不新建条目。

## 代码工程纪律

> 以下纪律适用于代码项目，由 `507-setup` 写入。源自全局 `~/.pi/agent/AGENTS.md` 的代码专属条款。

- **删除测试判断模块价值**：判断一个模块/抽象是否值得存在，想象删掉它——复杂度消失说明它只是透传（删）；复杂度在多个调用处重新出现，说明它在真正减负（留）。
- **接缝纪律**：只在真有变化的地方引入接口/抽象层。只有一个实现（adapter）的是"假设接缝"，两个以上不同实现才是真接缝；别为单一用法提前抽接口。
- **函数粒度**：函数控制在 100 行以内；超出则考虑拆分。
- **测试看行为**：测试优先通过公共接口验证行为，不测内部实现；mock 只放在系统边界。
- **先建反馈环再调 bug**：调 bug 先造一个快速、确定性、agent 能跑的 pass/fail（成败）信号（失败测试/curl/CLI 重放/headless 等）；没有反馈环就别盯着代码空猜，列已试方法后求助用户。信号是 90% 的调试，其余是机械操作。
- **插桩打 tag**：所有临时 debug 日志打唯一前缀 tag（如 `[DEBUG-a4f2]`），清理时一个 grep 全删；未打 tag 的临时日志会残留。
