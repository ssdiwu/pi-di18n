# Changelog

All notable changes to `pi-di18n` are documented here.

## Unreleased

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
