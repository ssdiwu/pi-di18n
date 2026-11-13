// Runtime UI description cache: ~/.pi/agent/state/pi-di18n/ui.json
// Used for user-visible command/autocomplete descriptions from extensions,
// prompt templates, and skills. LLM-facing tool descriptions stay in src/think/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { statePath } from "../state-paths.js";

export type UiEntry = { en: string; translated: string };
export type UiLocaleData = { command: Record<string, UiEntry> };
export type UiCache = { locales: Record<string, UiLocaleData> };

const DEFAULT_CACHE: UiCache = { locales: {} };
// 惰性解析：statePath 每次读取 PI_DI18N_STATE_DIR，保证测试在模块导入后设置的环境变量仍生效。
const cachePath = (): string => statePath("ui.json");
let activeCache: UiCache = loadUiCache();

function ensureLocale(cache: UiCache, locale: string): UiLocaleData {
	let data = cache.locales[locale];
	if (!data) {
		data = { command: {} };
		cache.locales[locale] = data;
	}
	return data;
}

export function loadUiCache(): UiCache {
	try {
		const path = cachePath();
		if (!existsSync(path)) return { ...DEFAULT_CACHE, locales: {} };
		const raw = readFileSync(path, "utf-8");
		const data = JSON.parse(raw) as Partial<UiCache>;
		return { locales: data?.locales ?? {} };
	} catch {
		return { ...DEFAULT_CACHE, locales: {} };
	}
}

export function saveUiCache(cache: UiCache): void {
	try {
		const path = cachePath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(cache, null, 2), "utf-8");
	} catch {
		// Cache write failure must not affect UI.
	}
}

export function setActiveUiCache(cache: UiCache): void {
	activeCache = cache;
}

export function getActiveUiCache(): UiCache {
	return activeCache;
}

export function getCachedCommandDescription(locale: string, key: string, currentEn: string, cache: UiCache = activeCache): string | undefined {
	const entry = cache.locales[locale]?.command[key];
	if (!entry) return undefined;
	return entry.en === currentEn ? entry.translated : undefined;
}

export function putCachedCommandDescription(cache: UiCache, locale: string, key: string, en: string, translated: string): void {
	const data = ensureLocale(cache, locale);
	data.command[key] = { en, translated };
	saveUiCache(cache);
}

export function getUiDebug(locale: string, cache: UiCache = activeCache): string {
	const data = cache.locales[locale];
	const commandCount = data ? Object.keys(data.command).length : 0;
	return `ui.cached(command=${commandCount})`;
}
