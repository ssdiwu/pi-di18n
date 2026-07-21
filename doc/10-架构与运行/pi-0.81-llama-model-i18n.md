# Pi 0.81 /llama 与 /model 本地化

## 背景

Pi 0.80.8 起为 `/model` 引入后台模型目录刷新，在 `model-selector.js` 新增 5 类刷新状态文案；Pi 0.81.0 新增内置 `/llama` 扩展命令与 `llama.cpp` 模型管理 UI。这些表面未在 pi-di18n 中本地化。

## 修复

- `locales/en.json`、`locales/zh-CN.json`、`locales/zh-TW.json` 新增 `pi.slash.llama.description` 静态描述，并把 `/reload` 描述同步到 0.81 的 `context files` 文案。
- `src/core-hacks-locales/zh-CN.json` 补齐 `/llama` 模型管理 UI 的固定标签与操作提示（`llama.cpp models`、`Loading model`、`Download model…`、`Unload model?`、`Select quantization` 等），不翻译模型 ID、provider、量化名、百分比与下载次数。
- `src/core-hacks.ts` 的 `postprocessZhCnUiLine` 补齐 `/model` 5 类刷新状态的 regex 本地化，保留动态 provider id 与目录计数值。
- `src/core-hacks.ts` 新增 `patchCustomComponentRender` 与 `showExtensionCustom` patch：自定义组件的 `render()` 输出按行本地化，render 抛错或本地化抛错时降级返回原行，不 reject 宿主 custom-UI Promise。
- `uninstallCoreHacks` 增加 `showExtensionCustom` 恢复。

## 边界

- 只翻译用户可见标签和操作提示；模型 ID、provider id、量化名、上下文大小、百分比、下载次数与 URL 保持原样。
- `showExtensionCustom` patch 与其他 `showExtension*` patch 一致 fail-soft：渲染层异常不影响 `/llama` 业务 Promise 或后续命令。
- 开发基线升级到 `@earendil-works/pi-coding-agent` 0.81.0；compaction 模块改从 `@earendil-works/pi-ai/compat` 导入 `complete`/`getModel`/`getEnvApiKey`。

## 验证

`npm test` 覆盖：

- `tests/slash-i18n.test.ts`：22 条内置命令 en 基准与 0.81 上游一致，zh-CN/zh-TW 全部本地化；`/llama` 静态描述存在且本地化。
- `tests/model-i18n.test.ts`：5 类刷新状态 zh-CN 全部本地化，保留动态 provider/计数。
- `tests/llama-custom-ui.test.ts`：`showExtensionCustom` 已 patch，render 输出含中文；i18n 抛错时降级返回原行。

真实 Pi `0.81.x` smoke 建议复测：

```text
/lang zh-CN
/model
/llama
/lang debug
/lang probe
```

期望：`/model` 刷新状态、`/llama` 模型管理界面标题与操作提示均为中文；`slashDescMode=primary`，`probe.enabled=true`。