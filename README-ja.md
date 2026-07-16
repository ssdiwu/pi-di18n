# pi-di18n

[English](./README.md) | [简体中文](./README-zh.md) | [日本語](./README-ja.md) | [한국어](./README-ko.md)

`pi-di18n` は [pi](https://github.com/earendil-works/pi-coding-agent) 向けのローカライズ拡張です。`pi-i18n` の TUI i18n / `core-hacks` 路線を引き継ぎ、`pi-compaction-i18n` の要約ローカライズを統合し、さらに `/lang think` による LLM 向け tool/parameter description のローカライズを追加します。

## 対象範囲

| ライン | 対象 | 範囲 |
|---|---|---|
| A-line: TUI localization | ユーザー | ボタン、selector、状態/警告/エラー、slash command description、session selector 文言 |
| B-line: thinking localization | LLM | provider payload 内の tool / parameter `description` |
| C-line: summary localization | ユーザー | `/compact` と `/tree` の要約 |

## 主な機能

- **TUI ローカライズ**: `core-hacks` で pi 内部の描画経路を runtime patch し、UI ラベルや built-in slash command description を翻訳します。
- **LLM thinking language localization**: `/lang think on` により、provider request payload 内の tool/parameter description を現在の `/lang` locale に置き換えます。
- **Non-invasive status bar**: pi の native footer/status bar は置き換えず、model、cwd、token、git、worktree の情報を保持します。
- **Provider payload coverage**: OpenAI-style、Anthropic、Google/Gemini の tool schema に対応します。
  - OpenAI-style: `tools[].function.description` / `function.parameters.properties.*.description`
  - Anthropic: `tools[].description` / `input_schema.properties.*.description`
  - Google/Gemini: `tools[].functionDeclarations[].description` / `parametersJsonSchema.properties.*.description`
- **12 言語 baseline**: `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `vi`, `es`, `pt-BR`, `de`, `fr`, `id`, `hi` の事前翻訳を同梱します。
- **Runtime fallback + cache**: baseline にない新しい tool は現在の session model で翻訳し、`~/.pi/agent/state/pi-di18n/think.json` にキャッシュします。
- **Summary localization**: `/compact` と `/tree` の要約は現在の `/lang` locale に従います。

## インストール

公開後:

```bash
pi install npm:pi-di18n
```

ローカル開発:

```bash
pi install /absolute/path/to/pi-di18n
```

インストール後、pi を再起動してください。`/reload` は拡張リソースを再読み込みしますが、`core-hacks` を編集した場合はモンキーパッチが現在のプロセスに残るため、pi の再起動が必要です。

現在の checkout だけを読み込んでテストする場合:

```bash
pi -ne -e /absolute/path/to/pi-di18n/index.ts --offline
```

## 使い方

```text
/lang setup beginner
/lang ja
/lang debug
/lang probe
```

LLM 向け thinking localization を有効化:

```text
/lang think on
/lang think doctor
```

無効化:

```text
/lang think off
```

キャッシュ削除:

```text
/lang think clear      # 現在の locale のみ
/lang think clear-all  # 全 locale
```

## `/lang think` の動作

`/lang think` は独自の言語設定を持ちません。現在の `/lang` locale に従います。

```text
/lang ja
/lang think on
```

検索順序:

1. package に同梱された prefilled baseline;
2. English source invalidation 付き local cache;
3. 現在の session model による runtime LLM fallback。

安全境界: 翻訳するのは prose `description` のみです。tool name、parameter name、`type`、`enum`、default value、schema structure は翻訳しません。

## Diagnostics

```text
/lang debug
/lang probe
/lang think doctor
```

`/lang think doctor` は locale、enabled state、baseline coverage、cache count、stale entries、pending entries を報告します。

## Development

```bash
npm install
npm test
npm pack --dry-run
```

現在の検証基準:

```text
Test Files  17 passed (17)
Tests       88 passed (88)
```

詳細は [`doc/40-版本实施方案/verification-2026-06-17.md`](./doc/40-%E7%89%88%E6%9C%AC%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88/verification-2026-06-17.md) を参照してください。

## Compatibility

対象 baseline は `@earendil-works/pi-coding-agent` 0.79.x です。pi にはまだ native full TUI i18n API がないため、TUI localization は best-effort の `core-hacks` に依存します。pi をアップグレードしたら `/lang debug`、`/lang probe`、`npm test`、`npm pack --dry-run` を実行してください。

## License

MIT
