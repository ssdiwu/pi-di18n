// 摘要本地化的语言映射（整合自 pi-compaction-i18n）。
// 注意：本模块不负责检测 locale —— locale 由 index.ts 通过 i18n.getLocale() 传入，
// 与 TUI 的 /lang 语言选择共享同一个真相源。

export type SupportedLanguage =
	| "zh-Hans"
	| "zh-Hant"
	| "ja"
	| "ko"
	| "de"
	| "fr"
	| "es"
	| "pt"
	| "ru"
	| "ar"
	| "en";

/** locale tag → 摘要语言码。未知 locale 回退到 en。 */
export function languageForLocale(locale?: string): SupportedLanguage {
	if (!locale) return "en";

	const [rawLang, rawRegion] = locale.split("-");
	const lang = rawLang?.toLowerCase() ?? "en";
	const region = rawRegion?.toUpperCase() ?? "";

	switch (lang) {
		case "zh":
			return region === "TW" || region === "HK" || region === "MO" ? "zh-Hant" : "zh-Hans";
		case "ja":
			return "ja";
		case "ko":
			return "ko";
		case "de":
			return "de";
		case "fr":
			return "fr";
		case "es":
			return "es";
		case "pt":
			return "pt";
		case "ru":
			return "ru";
		case "ar":
			return "ar";
		default:
			return "en";
	}
}

export function languageInstructionForLocale(locale?: string): string {
	switch (languageForLocale(locale)) {
		case "zh-Hans":
			return "Write the entire summary in Simplified Chinese (简体中文). All headings and body content must be in Simplified Chinese.";
		case "zh-Hant":
			return "Write the entire summary in Traditional Chinese (繁體中文). All headings and body content must be in Traditional Chinese.";
		case "ja":
			return "Write the entire summary in Japanese (日本語). All headings and body content must be in Japanese.";
		case "ko":
			return "Write the entire summary in Korean (한국어). All headings and body content must be in Korean.";
		case "de":
			return "Write the entire summary in German (Deutsch). All headings and body content must be in German.";
		case "fr":
			return "Write the entire summary in French (Français). All headings and body content must be in French.";
		case "es":
			return "Write the entire summary in Spanish (Español). All headings and body content must be in Spanish.";
		case "pt":
			return "Write the entire summary in Portuguese (Português). All headings and body content must be in Portuguese.";
		case "ru":
			return "Write the entire summary in Russian (Русский). All headings and body content must be in Russian.";
		case "ar":
			return "Write the entire summary in Arabic (العربية). All headings and body content must be in Arabic.";
		case "en":
		default:
			return "Write the entire summary in English. All headings and body content must be in English.";
	}
}
