# src/ui-localize/

A 线 runtime UI description localization.

This module localizes user-visible command/autocomplete descriptions that do not have static bundle keys, especially extension, prompt-template, and skill command descriptions.

## Contract

- It is for humans, not for LLM provider payloads. LLM-facing tool/param localization stays in `src/think/`.
- It never blocks UI rendering. Translation runs in `session_start` as fire-and-forget prefetch; render paths only read cached translations.
- It stores cache in `~/.pi/agent/state/pi-di18n/ui.json` with English-source invalidation.
- Static/bundled strings still belong to `locales/` or `src/core-hacks-locales/`; this module is for runtime and third-party descriptions.
