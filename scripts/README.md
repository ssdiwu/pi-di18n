# scripts/

`pi-di18n` 的维护脚本目录。

当前只放**生成型维护脚本**，不放运行时逻辑。

## 当前文件

| 文件 | 说明 |
|------|------|
| [export-think-baseline.mjs](./export-think-baseline.mjs) | 导出 pi 内置工具与参数的英文 `description` baseline，供 `src/think-locales/en.json` 更新时使用 |

## 使用场景

- pi 升级后，内置工具或参数说明发生变化。
- 需要刷新 B 线 `/lang think` 的英文 baseline 源。

## 边界

- 这里只负责**导出 baseline 源数据**，不直接改写 `src/think-locales/` 文件。
- 运行时翻译逻辑在 `src/think/`，不要把生产逻辑挪到这里。
- 脚本依赖本机已安装的 pi dist 路径；路径约束与 `src/core-hacks.ts` 的 coreDist 发现逻辑保持一致。
