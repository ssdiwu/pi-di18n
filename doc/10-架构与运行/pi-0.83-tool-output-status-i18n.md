# Pi 0.83 工具输出状态本地化

## 上游变化

Pi 0.83 在用户切换工具输出展开状态时，通过 `InteractiveMode.showStatus()` 显示以下状态提示：

- `Tool output: expanded`
- `Tool output: collapsed`

## 本项目适配

`core-hacks` 已代理 `showStatus()`，因此继续沿用现有精确文案映射：

- 七个维护中的 `src/core-hacks-locales/*.json` 非英文语言包分别提供两条翻译；
- `zh-TW` 继续由 legacy 映射提供繁体中文翻译；
- 两条上游原文加入 core scan anchor，便于后续升级核对。

不修改 Pi 状态机、快捷键或展开行为，只翻译最终展示文案。

## 验证

`tests/tool-output-status-i18n.test.ts` 验证全部维护语言包均覆盖两个状态，并单独核对 `zh-CN` 与 `zh-TW` 的最终文案。
