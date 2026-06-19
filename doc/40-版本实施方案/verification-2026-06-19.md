# 验证记录：2026-06-19

## 目标

验证 `zh-CN` 在真实 `pi` TUI 中的漏翻问题已修复，覆盖：

- `model selector`：`Scope: all | scoped`、`tab scope (all/scoped)`、`Model Name`
- `settings selector`：`Default project trust`、`Warnings` 及相关说明/值
- `tree/login/logout/trust/resume` 等真实 selector 与提示行
- `/export` `/import` `/copy` `/share` 的错误/用法提示

## 自动测试

命令：

```bash
npm test
```

结果：

```text
Test Files  10 passed (10)
Tests       45 passed (45)
```

新增覆盖：

- `zh-CN` model selector 纯文本行翻译
- 带 ANSI 颜色码的真实 selector 行翻译
- `Default project trust` / `Warnings` / `configure` 等设置行翻译
- `/export` `/import` `/copy` 这类 `Error:` 行翻译
- `resume` 搜索提示 / 排序提示 / 空状态提示
- whole-line-only 短值保护，避免 `configure` 误伤 `configured`

## npm 打包 dry-run

命令：

```bash
npm pack --dry-run
```

结果摘要：

```text
package size: 124.8 kB
unpacked size: 505.4 kB
total files: 78
```

## 真实 pi 会话验证

命令基线：

```bash
PI_LOCALE=zh-CN pi -ne -e /Users/diwu/Documents/Codes/Githubs/pi-di18n/index.ts --offline
```

说明：

- `-ne` 禁用 extension discovery，仅显式加载当前 `pi-di18n`
- 使用 Python `pty` 驱动真实 TUI，并抓取 ANSI 输出后去样式核验

### `/model` 验证

进入 `/model` 后抓取到的关键行：

```text
范围：全部 | 已筛选
tab 范围（全/筛）
模型：GPT-5.4
```

结论：

- `Scope: all | scoped` 不再残留英文值
- `tab scope (all/scoped)` 不再半翻译/截断为英文混搭
- `Model Name` 不再出现 `Model 名称` 混搭

### `/settings` 验证

第一页关键行：

```text
→ 自动压缩 开
自动调整图片大小 开
屏蔽图片 关
技能命令 开
显示硬件光标 关
收缩时清除 关
终端进度 开
引导模式 全部
```

后半页关键行：

```text
默认项目可信策略 问
双击 Esc 动作 会话树
树状筛选模式 默认
→ 警告 配置
思考等级 高
主题 明/暗
启用或禁用单项警告
```

结论：

- 用户截图中的 `Default project trust` / `Warnings` 已变为中文
- `Ask` 不再显示英文，也不再因宽度保护被截成半词
- `configure` 不再污染 `configured` 之类英文句子
- 布尔值与常见枚举值在已覆盖设置行中可显示为中文

### `/tree` `/login` `/logout` `/trust` `/resume` 验证

关键行摘录：

```text
会话树
选择认证方式：
选择要登出的提供商：
  ↑↓ 导航  enter 保存  escape/ctrl+c 取消
恢复会话（当前文件夹）
  tab 范围 · re:<模式> 正则 · "短语" 精确
  ctrl+s 排序 · ctrl+n 命名 · ctrl+d 删除 · ctrl+p 路径（关） · ctrl+r 重命名
```

结论：

- `tree/login/logout/trust/resume` 的真实 selector 标题、帮助提示和空状态已覆盖到中文
- `/resume` 不再残留 `Resume Session`、`Loading`、`No sessions in current folder` 这类核心英文提示

### `/export` `/import` `/copy` 验证

关键行摘录：

```text
错误：导出会话失败：还没有可导出的会话，请先开始对话
错误：用法：/import <path.jsonl>
错误：还没有可复制的 agent 消息。
```

结论：

- 错误消息主体已本地化
- upstream `InteractiveMode.showError()` 追加的 `Error:` 前缀也已在真实 TUI 中改为中文

## 结论

本次 `zh-CN` TUI 漏翻回归已通过：

- 自动测试通过
- 打包 dry-run 通过
- 真实 `pi` TUI 中 `model/settings/tree/login/logout/trust/resume` 与 `/export` `/import` `/copy` 关键漏翻点已修复
