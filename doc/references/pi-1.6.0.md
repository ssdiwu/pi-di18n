# Pi 1.6.0 适配验证（2026-11-25）

独立临时 HOME、空工作目录和 `PI_OFFLINE=1`。针对 1.6.0 实际打包的 InteractiveMode 和登录组件运行 `npm test`。`node scripts/verify-core-hacks-locales.mjs --check` 验证 8 个非英文维护词包。

在临时 agent 目录设置 `defaultProjectTrust` 为 `never`，用 `PI_LOCALE=zh-CN python3 scripts/tui-smoke.py` 打开真实设置页，见到“自动压缩”和“编辑器内距”。真实 Pi RPC 中依次执行 `/lang debug`、`/lang probe`、`/lang ja`、`/lang debug`，报告 `slashDescMode=primary`、10 个匹配点、0 个缺失或不安全点，切换后读回 `locale=ja`。付费提供方未调用。

独审复现来源标签丢失后，使用 Pi 1.6.0 的实际 bundle 创建含项目模板和 npm 扩展命令的补全提供器：修复前两条标签均丢失；修复后 `[p]` 与 `[u:npm:pi-di18n]` 均保留，翻译仍正确。全套测试 157/157，词典检查与真实设置页冒烟通过。
