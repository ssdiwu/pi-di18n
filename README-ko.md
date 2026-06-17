# pi-di18n

[English](./README.md) | [简体中文](./README-zh.md) | [日本語](./README-ja.md) | [한국어](./README-ko.md)

`pi-di18n`은 [pi](https://github.com/earendil-works/pi-coding-agent)를 위한 로컬라이제이션 확장입니다. `pi-i18n`의 TUI i18n / `core-hacks` 흐름을 이어받고, `pi-compaction-i18n`의 요약 로컬라이제이션을 통합하며, `/lang think`를 통해 LLM이 읽는 tool/parameter description도 현재 언어에 맞춥니다.

## 로컬라이제이션 범위

| 라인 | 대상 | 범위 |
|---|---|---|
| A-line: TUI localization | 사용자 | 버튼, selector, 상태/경고/오류, slash command description, session selector 문구 |
| B-line: thinking localization | LLM | provider payload 안의 tool / parameter `description` |
| C-line: summary localization | 사용자 | `/compact` 및 `/tree` 요약 |

## 주요 기능

- **TUI 로컬라이제이션**: `core-hacks`로 pi 내부 렌더링 경로를 runtime patch 하여 UI label, selector, status message, built-in slash command description을 번역합니다.
- **LLM thinking-language localization**: `/lang think on`이 provider request payload의 tool/parameter description을 현재 `/lang` locale로 교체합니다.
- **Non-invasive status bar**: pi native footer/status bar를 교체하지 않으므로 model, cwd, token, git, worktree 정보가 그대로 보입니다.
- **Provider payload coverage**: OpenAI-style, Anthropic, Google/Gemini tool schema를 지원합니다.
  - OpenAI-style: `tools[].function.description` / `function.parameters.properties.*.description`
  - Anthropic: `tools[].description` / `input_schema.properties.*.description`
  - Google/Gemini: `tools[].functionDeclarations[].description` / `parametersJsonSchema.properties.*.description`
- **12개 언어 baseline**: `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `vi`, `es`, `pt-BR`, `de`, `fr`, `id`, `hi`의 사전 번역을 포함합니다.
- **Runtime fallback + cache**: baseline에 없는 새 tool은 현재 session model로 번역하고 `~/.pi/agent/state/pi-di18n/think.json`에 캐시합니다.
- **Summary localization**: `/compact`와 `/tree` 요약은 현재 `/lang` locale을 따릅니다.

## 설치

배포 후:

```bash
pi install npm:pi-di18n
```

로컬 개발:

```bash
pi install /absolute/path/to/pi-di18n
```

설치 후 pi를 재시작하거나 `/reload`를 실행하세요.

현재 checkout만 로드해 테스트하려면:

```bash
pi -ne -e /absolute/path/to/pi-di18n/index.ts --offline
```

## 사용법

```text
/lang setup beginner
/lang ko
/lang debug
/lang probe
```

LLM용 thinking localization 켜기:

```text
/lang think on
/lang think doctor
```

끄기:

```text
/lang think off
```

캐시 삭제:

```text
/lang think clear      # 현재 locale
/lang think clear-all  # 모든 locale
```

## `/lang think` 동작

`/lang think`는 별도의 언어 설정을 갖지 않습니다. 현재 `/lang` locale을 따릅니다.

```text
/lang ko
/lang think on
```

조회 순서:

1. package에 포함된 prefilled baseline;
2. English source invalidation이 있는 local cache;
3. 현재 session model을 사용하는 runtime LLM fallback.

안전 경계: prose `description`만 번역합니다. tool name, parameter name, `type`, `enum`, default value, schema structure는 번역하지 않습니다.

## Diagnostics

```text
/lang debug
/lang probe
/lang think doctor
```

`/lang think doctor`는 locale, enabled state, baseline coverage, cache count, stale entries, pending entries를 보고합니다.

## Development

```bash
npm install
npm test
npm pack --dry-run
```

현재 검증 기준:

```text
Test Files  8 passed (8)
Tests       41 passed (41)
```

자세한 검증 기록은 [`doc/40-版本实施方案/verification-2026-06-17.md`](./doc/40-%E7%89%88%E6%9C%AC%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88/verification-2026-06-17.md)를 참고하세요.

## Compatibility

기준 버전은 `@earendil-works/pi-coding-agent` 0.79.x입니다. pi에는 아직 native full TUI i18n API가 없으므로 TUI localization은 best-effort `core-hacks`에 의존합니다. pi를 업그레이드한 뒤에는 `/lang debug`, `/lang probe`, `npm test`, `npm pack --dry-run`을 실행하세요.

## License

MIT
