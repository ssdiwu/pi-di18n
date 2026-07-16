# Pi 0.80 /session 信息本地化

## 背景

运行中的全局 Pi 已进入 `0.80.x`，而本项目的开发依赖仍为 `0.79.10`。Pi 0.80 扩展了 `/session` 的统计输出，新增 `Tools`、`Cached`、`Uncached`、`Cache Re-billed` 以及动态的调用、缓存写入、token 和 cache miss（缓存未命中）说明；原有 `zh-CN` 映射因此留下英文片段。

## 修复

- `src/core-hacks-locales/zh-CN.json` 补齐 Pi 0.80 的静态标签和动态短语映射。
- `src/core-hacks.ts` 的 `zh-TW` legacy（旧版）分支补齐同一组会话统计文案。
- 继续复用 `InteractiveMode.handleSessionCommand` 的既有 post-render（渲染后）本地化 patch；不接管统计计算、数值格式或命令逻辑。

## 边界

只翻译用户可见标签和单位：模型标识、路径、会话 ID、金额、百分比和计数值保持原样。patch 渲染异常时沿既有 `try/catch` fail-soft（失败降级）路径回退，不影响 `/session` 命令执行。

## 验证

`tests/core-hacks-slash.test.ts` 使用 Pi 0.80 的完整 session report（会话报告）形状断言 `zh-CN` 无混杂英文标签，同时覆盖 `zh-TW` cache breakdown（缓存明细）。

真实 Pi `0.80.8` smoke（冒烟测试）已在新进程中执行 `/reload`、`/session`、`/lang debug` 与 `/lang probe`：会话标题、工具和令牌标签均为中文，`slashDescMode=primary`，`probe.enabled=true`。缓存读写与 cache miss（缓存未命中）的带数值场景由完整 report fixture（报告样本）回归覆盖。

复核命令：

```text
/lang zh-CN
/session
/lang debug
/lang probe
```

期望：`工具`、`令牌`、`已缓存`、`未缓存`、`缓存重计费`及其动态单位均显示为中文；数值不变。
