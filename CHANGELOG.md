# Changelog

All notable changes to `pi-di18n` are documented here.

## Unreleased

### Fixed
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
