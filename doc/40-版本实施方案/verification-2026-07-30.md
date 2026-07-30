# 2026-07-30 Pi 0.83 升级适配验证

## 验证范围

- localized compaction / tree summary 的 header-only auth、provider env、usage、retry、cache 与 routing session 语义；
- `/lang think` 运行时翻译的 header-only auth；
- Pi 0.82/0.83 scoped-model 与 provider login TUI 文案；
- Pi 0.83 `read` 工具的 `bmp` baseline；
- core-hacks 登录 renderer 的 fail-soft 边界。

## 自动测试

```text
$ npm test
Test Files  25 passed (25)
Tests       109 passed (109)
```

语言包均可解析为 JSON；重新运行 `node scripts/export-think-baseline.mjs` 导出 7 个工具、21 个参数，与 `src/think-locales/en.json` 无差异。

## 打包检查

```text
$ npm pack --dry-run
package size: 143.8 kB
unpacked size: 571.4 kB
total files: 79
```

## 真实 Pi 0.83 TUI

在隔离的 `PI_CODING_AGENT_DIR` / `PI_DI18N_STATE_DIR` 下，通过当前 checkout 的 `index.ts` 启动全局 Pi 0.83，使用一个失效 scoped-model 配置重放：

```text
/scoped-models
/login openrouter
/lang debug
/lang probe
```

观察结果：

```text
→ ghost/model [不可用] ✗
  模型不可用
option+up/option+down reorder · ctrl+s 保存 · 0/0 已启用 · 1 不可用
选择 OpenRouter 的认证方式：
→ 使用 OpenRouter 登录
  使用 API 密钥登录
slashDescMode=primary
probe.enabled=true total=8 matched=8 notFound=0 hit=3 translated=2
```

没有残留 `Model unavailable`、`[unavailable]`、`Select authentication method` 或 `Sign in with`。真实登录动作会打开浏览器并访问外部 OAuth，因此本次不提交登录；动态登录 dialog 通过 `tests/login-dialog-i18n.test.ts` 直接覆盖翻译和 renderer 抛错边界。

## 已知上游边界

Pi 在加载 extension 前解析 scoped-model 设置。失效 pattern 触发的首条启动 warning 仍可能是：

```text
Warning: No models match pattern "ghost/model"
```

该内容发生在 `core-hacks` 安装之前，扩展无法追溯改写已输出终端内容；extension 安装后的相同 warning 路径已有语言包映射。
