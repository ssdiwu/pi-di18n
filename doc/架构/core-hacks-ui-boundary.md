# core-hacks UI 边界

> 本文件记录 `pi-di18n` 的 TUI patch 边界。`core-hacks` 是项目核心能力，但它只能增强 Pi 主程序 UI，不允许成为命令和状态逻辑的单点故障。

## 背景

`pi-di18n` 通过 `core-hacks` patch Pi 主程序内部 TUI 渲染路径，覆盖 slash 命令描述、selector、错误/警告提示等 UI 表面。这个能力依赖上游 Pi 的内部组件、模块路径和渲染实现，属于 best-effort patch。

近期在多个 Pi 扩展中反复出现 `Spacer is not defined`。该错误来自主程序 TUI 渲染层：代码路径里引用了未定义的 `Spacer` 组件。虽然根因不在各扩展自身，但扩展如果把业务结果和 UI 渲染绑在同一个未保护调用里，就会被上游 UI 异常拖死。

## 边界原则

- `core-hacks` 只能影响 UI 展示，不能影响 `/lang` 命令结果、locale 状态、缓存状态或后续命令执行。
- `core-hacks` 的 monkeypatch（猴子补丁）存活于 Pi 进程；修改其源码后必须重启 Pi，`/reload` 不保证替换已安装的 patch 闭包或全局语言包缓存。
- 上游 TUI 渲染异常时，扩展必须 fail-soft（失败降级）：降级显示、跳过该 UI 更新或回退英文原文。
- 状态更新、缓存写入、语言切换结果必须先于或独立于 UI patch 渲染。
- `patchedShowError`、`patchedShowWarning`、selector 和 slash 描述 patch 路径必须显式容错。

## 典型高风险路径

| 路径 | 风险 | 要求 |
|---|---|---|
| `patchedShowError` / `patchedShowWarning` | 错误提示本身渲染失败，掩盖原始错误 | 捕获 TUI 异常，保留原错误语义 |
| slash 命令描述 patch | 上游命令结构或渲染组件变化 | 找不到 patch 点时回退原文，不中断 `/lang` |
| selector / resume / import-export 错误提示 | TUI 表面多、上游变化频繁 | 每个 patch 点独立降级，不共享未保护渲染块 |
| `/lang debug` / `/lang probe` | 诊断命令依赖内部路径 | 诊断失败要输出可读 fallback，不影响 locale |

## 实现要求

- UI patch 调用必须用 `try/catch` 或等价边界隔离。
- catch 块不能吞掉业务错误；要尽量保留原始错误信息或英文 fallback。
- 不把多个 patch 点包在一个大 try/catch 里；一个 UI 表面失败不应禁用其它表面。
- 不把 `core-hacks` 失败视为安装失败；应在 `/lang debug` / `/lang probe` 中暴露状态。

## 测试要求

改动 `core-hacks`、错误/警告展示、selector、slash 描述或 TUI 诊断路径时，至少补一类回归测试：

1. 模拟 UI 渲染函数抛错。
2. 断言 `/lang` 或相关命令仍返回结果。
3. 断言 locale / cache / patch 状态没有被半更新破坏。
4. 断言 fallback 文案可读且不泄露内部异常堆栈给普通用户。

真实 Pi TUI 还需要 smoke test：

```text
/lang zh-CN
/lang debug
/lang probe
```

重点观察：`coreDist`、`slashDescMode`、`probe` matched/hit/translated，以及错误/警告提示是否在 UI 异常时降级而不是中断命令。
