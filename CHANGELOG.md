# Changelog

All notable changes to `pi-di18n` are documented here.

## Unreleased

### Added
- Localized Pi 0.83 tool-output expansion status notices (`Tool output: expanded` and `Tool output: collapsed`) across maintained TUI locales.

### Fixed
- Restored Pi 0.81–0.82 summary semantics in localized `/compact` and `/tree` flows: header-only/provider-env authentication, usage accounting, bounded transient retries, and isolated no-cache routing session IDs.
- Localized Pi 0.82/0.83 unavailable scoped-model rows and OpenRouter/Kimi login prompts, with fail-soft login-dialog rendering.
- Refreshed the prefilled `read` tool-description baseline for Pi's `bmp` image support.

### Changed
- Upgraded the development compatibility baseline to `@earendil-works/pi-coding-agent` 0.83.x.

## 0.2.0 - 2026-07-21

### Added
- Localized the Pi 0.81 built-in `/llama` extension command description (`pi.slash.llama.description`, `slash.llama.description`) and the `/llama` custom model-management UI rendered through `showExtensionCustom`.
- Localized the Pi 0.80.8+ `/model` background catalog-refresh status messages (`Refreshing model catalogs…`, `Model catalogs refreshed.`, refresh timeout/failure notices) while preserving dynamic provider ids and catalog counts. Patched `ModelSelectorComponent.updateList` so dynamically-added refresh-status Text nodes are re-localized on every render.
- Added `slash.llama.description` legacy-format key so `I18nRegistry.t("pi.slash.llama.description")` resolves correctly, and preserved the autocomplete source tag (`[t]`/`[u]`) when translating extension command descriptions.

### Changed
- Synced the `/reload` slash description baseline to Pi 0.81 (`Reload keybindings, extensions, skills, prompts, themes, and context files`) across `en`, `zh-CN`, and `zh-TW`.
- Patched `InteractiveMode.showExtensionCustom` so custom extension UI components (e.g. `/llama`) get their rendered lines localized line-by-line; render failures stay fail-soft and never reject the host's custom-UI Promise.
- Upgraded the development baseline to `@earendil-works/pi-coding-agent` 0.81.0 and migrated compaction imports to `@earendil-works/pi-ai/compat`.

### Added
- Added `disabledBuiltinToolOverrides` so another extension can own selected `read`, `bash`, `edit`, or `write` tool names without disabling the rest of pi-di18n.

### Tests
- Isolated extension registration from real user state and covered selective built-in tool override exclusions.

## 0.1.8 - 2026-07-16

### Changed
- **工具结果人类可读投影**：`i18n_get_locale` 增加本地化的折叠与展开文字投影；折叠使用实际快捷键提示，展开时显示解析来源、fallback（回退语言）和内置 UI 语言包，避免直接展示结构化 `details`。
- **Pi 0.80 `/session` 本地化**：补齐工具、缓存明细、token（令牌）和缓存重计费标签，避免中文界面混杂英文统计文案。

## 0.1.7 - 2026-07-13

### Tests
- Added a regression proving the upstream cache-miss notice still runs and remains visible when locale/template formatting throws.

## 0.1.6 - 2026-07-13

### Fixed
- Hardened dynamic cache-miss notice localization so snapshot, template, ANSI mutation, and renderer failures never prevent the upstream notice method from running or escape into the main session.

### Tests
- Added exact zh-CN/zh-TW idle and model-switch assertions, ANSI preservation coverage, and upstream-call fail-soft regressions.

## 0.1.5 - 2026-07-13

### Fixed
- Prevented oversized image and audio payloads from crossing the compaction retention boundary; complete tool turns are moved into the summary and unsafe boundaries cancel instead of falling back.
- Localized runtime cache-miss notices for model switches and idle gaps while preserving token, minute, and cost values; TUI rendering failures remain fail-soft.

### Tests
- Added real pi 0.79 split-turn compaction reconstruction coverage and cache-miss notice parser/patch regression coverage.

## 0.1.4 - 2026-07-13

### Fixed
- Prevented failed compaction summaries from falling back to the current session model for a second request; added provider/model diagnostics, error classification, and pi 0.79 `Cache miss notices` / `Output padding` localization coverage.

## 0.1.3 - 2026-06-25

### Fixed
- Stopped the false "slash command localization is running in fallback mode" warning that appeared intermittently on same-locale reloads (e.g. `/lang` picking the current language again, `/reload`, or extension hot reload). Re-installing core-hacks in the same locale is idempotent and now correctly reports `primary` instead of miscounting already-localized commands as unchanged.

## 0.1.2 - 2026-06-19

### Fixed
- Hardened the `showError` / `showWarning` core-hack patches so a transient upstream failure (e.g. `Spacer is not defined` after a pi upgrade) degrades to a stderr fallback instead of escalating to an `uncaughtException` that kills the pi process. The degradation is recorded under the `interactive.showError` / `interactive.showWarning` probe points with state `unsafe`, so `/lang probe` can surface it.
- Filled the remaining `zh-CN` selector gaps in `core-hacks`, especially the model, settings, tree, login, logout, trust, and resume selectors reported in real TUI screenshots.
- Added ANSI-aware row normalization so colored selector lines such as `Scope: all | scoped`, `tab scope (all/scoped)`, `Model Name`, and `Resume Session` localize correctly in real pi sessions.
- Localized `zh-CN` settings rows for `Default project trust`, `Warnings`, and related descriptions/values without corrupting English source strings like `configured`.
- Localized runtime error and usage notices for `/export`, `/import`, `/copy`, and `/share`, including the upstream `Error:` prefix rendered by interactive mode.
- Tightened short-value translations (`Ask`, `configure`, `Always trust`, `Never trust`) to whole-line-only matching so generic substrings no longer leak into unrelated UI text.

## 0.1.1 - 2026-06-18

### Fixed
- Clarified startup status notice so users can see whether `/lang think` is enabled.
- Refreshed the language/think status notice immediately after `/lang think on` and `/lang think off`.
- Localized the startup status wording for `zh-TW` more naturally.
- Isolated test state from real user state so test runs no longer overwrite `~/.pi/agent/state/pi-di18n/think.json`.

### Changed
- Added a shared state-path helper so `think` cache, UI cache, config, and compaction config use the same overridable state root.

## 0.1.0 - 2026-06-18

### Added
- Released `pi-di18n` as a pi localization extension covering full TUI localization, `/lang think` tool-description localization, and compaction summary localization.
- Added built-in slash-command description localization for pi 0.79, including `zh-CN`.
- Added runtime localization for extension, prompt-template, and skill command descriptions.
- Added baseline translations for 12 `/lang think` target languages.

### Fixed
- Restored slash descriptions to their original English text when core hacks are turned off.
- Switched slash description localization from `zh-TW`-only gating to all non-`en` locales.
