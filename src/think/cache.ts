// 翻译缓存读写：默认 ~/.pi/agent/state/pi-di18n/think.json。
//
// 可用 PI_DI18N_STATE_DIR 覆盖状态目录，便于测试隔离。
// 结构见 ThinkCache（enabled + locales）。每条 ThinkEntry 存 en 原文做失效比对。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ThinkCache, ThinkEntry, ThinkLocaleData, ThinkType } from "./types.ts";
import { statePath } from "../state-paths.js";

const CACHE_PATH = statePath("think.json");

const DEFAULT_CACHE: ThinkCache = { enabled: false, locales: {} };

function ensureLocale(cache: ThinkCache, locale: string): ThinkLocaleData {
	let data = cache.locales[locale];
	if (!data) {
		data = { tool: {}, param: {} };
		cache.locales[locale] = data;
	}
	return data;
}

export function loadCache(): ThinkCache {
	try {
		if (!existsSync(CACHE_PATH)) return { ...DEFAULT_CACHE, locales: {} };
		const raw = readFileSync(CACHE_PATH, "utf-8");
		const data = JSON.parse(raw) as Partial<ThinkCache>;
		return {
			enabled: Boolean(data?.enabled),
			locales: data?.locales ?? {},
		};
	} catch {
		return { ...DEFAULT_CACHE, locales: {} };
	}
}

export function saveCache(cache: ThinkCache): void {
	try {
		mkdirSync(dirname(CACHE_PATH), { recursive: true });
		writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
	} catch {
		// 缓存写入失败不影响主流程（下次重算）
	}
}

/** 读取缓存的翻译条目。返回 undefined 表示无缓存或 en 原文已变（过期）。 */
export function getCachedEntry(cache: ThinkCache, locale: string, type: ThinkType, key: string, currentEn: string): ThinkEntry | undefined {
	const data = cache.locales[locale];
	if (!data) return undefined;
	const entry = data[type][key];
	if (!entry) return undefined;
	// 失效比对：缓存 en 与当前 en 不一致视为过期（ADR 决策 11）
	if (entry.en !== currentEn) return undefined;
	return entry;
}

/** 写入一条翻译到缓存并落盘。 */
export function putCachedEntry(cache: ThinkCache, locale: string, type: ThinkType, key: string, en: string, translated: string): void {
	const data = ensureLocale(cache, locale);
	data[type][key] = { en, translated };
	saveCache(cache);
}

export function isEnabled(cache: ThinkCache): boolean {
	return cache.enabled;
}

export function setEnabled(cache: ThinkCache, enabled: boolean): void {
	cache.enabled = enabled;
	saveCache(cache);
}

/** 清除指定 locale 的缓存（含 tool/param）。locale 省略则清空全部 locale。 */
export function clearLocale(cache: ThinkCache, locale?: string): number {
	let cleared = 0;
	if (locale) {
		const data = cache.locales[locale];
		if (data) {
			cleared = Object.keys(data.tool).length + Object.keys(data.param).length;
			delete cache.locales[locale];
		}
	} else {
		for (const loc of Object.keys(cache.locales)) {
			const data = cache.locales[loc]!;
			cleared += Object.keys(data.tool).length + Object.keys(data.param).length;
		}
		cache.locales = {};
	}
	saveCache(cache);
	return cleared;
}
