# pi-di18n

[English](./README.md) | [简体中文](./README-zh.md) | [日本語](./README-ja.md) | [한국어](./README-ko.md)

`pi-di18n` is the localization extension for [pi](https://github.com/earendil-works/pi-coding-agent). It continues the full TUI i18n and `core-hacks` line from `pi-i18n`, integrates summary localization from `pi-compaction-i18n`, and adds LLM-facing tool-description localization through `/lang think`.

## What It Localizes

`pi-di18n` has three localization lines:

| Line | Audience | Scope |
|------|----------|-------|
| A-line: TUI localization | Human user | Buttons, selectors, status/warning/error messages, slash-command descriptions, session selector text |
| B-line: thinking localization | LLM | Tool and parameter `description` strings sent in provider payloads |
| C-line: summary localization | Human user | `/compact` and `/tree` summaries |

## Features

- **Full TUI localization** — keeps `core-hacks` to runtime-patch pi internal render paths, covering UI labels, selectors, status messages, and built-in slash-command descriptions.
- **Slash-command description fix** — ships `pi.slash.<name>.description` bundle keys for all pi 0.79 built-in slash commands, including `zh-CN`.
- **Session selector translation** — covers visible `session-selector` strings such as `Resume Session`, `Threaded`, `Recent`, `Fuzzy`, and delete prompts.
- **Non-invasive status bar** — does not replace pi's native footer/status bar, so model, cwd, token, git, and worktree information remain visible.
- **Runtime UI description localization** — asynchronously localizes extension, prompt-template, and skill command descriptions for autocomplete UI, then caches them locally without blocking rendering.
- **LLM thinking-language localization** — `/lang think on` replaces tool and parameter descriptions in provider request payloads so the model reads them in the active `/lang` locale.
- **Provider payload coverage** — supports OpenAI-style, Anthropic, and Google/Gemini tool schemas:
  - OpenAI-style: `tools[].function.description` and `function.parameters.properties.*.description`
  - Anthropic: `tools[].description` and `input_schema.properties.*.description`
  - Google/Gemini: `tools[].functionDeclarations[].description` and `parametersJsonSchema.properties.*.description`
- **Prefilled baseline translations** — includes offline baseline translations for 12 languages: `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `vi`, `es`, `pt-BR`, `de`, `fr`, `id`, `hi`.
- **Runtime fallback and cache** — descriptions missing from the baseline are translated with the current session model and cached under `~/.pi/agent/state/pi-di18n/think.json` with English-source invalidation.
- **Summary localization** — intercepts `session_before_compact` and `session_before_tree` so compaction and branch summaries follow the active `/lang` locale.
- **Extension i18n API compatibility** — preserves `pi-i18n/requestApi` and `pi-core/i18n/requestApi` events for other extensions.

## Installation

Once published:

```bash
pi install npm:pi-di18n
```

For local development:

```bash
pi install /absolute/path/to/pi-di18n
```

Then restart pi. `/reload` reloads extension resources, but after editing `core-hacks` you must restart pi because its monkeypatches remain in the current process.

To test this checkout without loading installed extensions:

```bash
pi -ne -e /absolute/path/to/pi-di18n/index.ts --offline
```

## Usage

Basic language setup:

```text
/lang setup beginner
/lang zh-CN
/lang debug
/lang probe
```

Enable LLM-facing thinking localization:

```text
/lang think on
/lang think doctor
```

Disable it:

```text
/lang think off
```

Clear cached runtime translations:

```text
/lang think clear      # clear current locale
/lang think clear-all  # clear all locales
```

Summary localization needs no extra command. It runs automatically when `/compact` or `/tree` branch summaries are triggered, and follows the current `/lang` locale.

## `/lang think` Behavior

`/lang think` does not set a separate language. It follows the current `/lang` locale.

```text
/lang zh-CN
/lang think on
```

The feature is off by default. When enabled, it uses a three-layer lookup:

1. prefilled baseline translations shipped with the package;
2. local cache with English-source invalidation;
3. runtime LLM fallback using the current session model.

Safety boundary: only prose `description` strings are translated. Tool names, parameter names, `type`, `enum`, defaults, values, and schema structure are never translated.

## Diagnostics

```text
/lang debug
/lang probe
/lang think doctor
```

`/lang think doctor` reports:

- current locale and enabled state;
- session tool/parameter counts;
- baseline coverage;
- cache counts;
- stale entries whose English source changed;
- pending descriptions that still need runtime translation.

## Development

```bash
npm install
npm test
npm pack --dry-run
```

Current verification commands:

```bash
npm test
npm pack --dry-run
```

See [`doc/40-版本实施方案/verification-2026-06-17.md`](./doc/40-%E7%89%88%E6%9C%AC%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88/verification-2026-06-17.md) for a dated verification snapshot and detailed records.

## Directory Layout

| Path | Description |
|------|-------------|
| `index.ts` | Extension entry point; registers `/lang`, `core-hacks`, thinking localization, and summary-localization hooks |
| `src/core-hacks.ts` | Runtime patches for TUI localization |
| `src/pi-ui.ts` | Localization for tool rendering, buttons, and other UI surfaces |
| `src/compaction/` | Localization for `/compact` and `/tree` summaries |
| `src/think/` | B-line LLM thinking-language localization |
| `src/ui-localize/` | A-line runtime UI description localization for extension/prompt/skill autocomplete descriptions |
| `src/think-locales/` | Prefilled baseline translations: `en` source + 12 target languages |
| `scripts/` | Maintenance scripts for exporting and refreshing generated baseline sources |
| `scripts/export-think-baseline.mjs` | Export pi built-in tool descriptions as baseline source; re-run on pi upgrade |
| `locales/` | i18n bundles |
| `src/core-hacks-locales/` | Exact/substring translation packs for `core-hacks` |
| `tests/` | vitest regression tests |
| `doc/` | Architecture notes, roadmap, ADRs, verification records, glossary |

## Compatibility

The baseline target is `@earendil-works/pi-coding-agent` 0.79.x.

pi currently has no native full TUI i18n API. TUI localization therefore depends on best-effort `core-hacks` that patch pi internal render paths. After every pi upgrade, run:

```text
/lang debug
/lang probe
```

and also:

```bash
npm test
npm pack --dry-run
```

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for released versions and user-visible changes.

## License

MIT
