// 翻译缓存读写：默认 ~/.pi/agent/state/pi-di18n/think.json。
//
// 可用 PI_DI18N_STATE_DIR 覆盖状态目录，便于测试隔离。
// 结构见 ThinkCache（enabled + locales）。每条 ThinkEntry 存 en 原文做失效比对。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ThinkCache, ThinkEntry, ThinkLocaleData, ThinkType } from "./types.ts";
import { statePath } from "../state-paths.js";

// 惰性解析：statePath 每次读取 PI_DI18N_STATE_DIR，保证测试在模块导入后
// 设置的环境变量仍生效（cache.ts 的消费者众多，导入早于测试 beforeAll）。
const cachePath = (): string => statePath("think.json");

const DEFAULT_CACHE: ThinkCache = { enabled: true, locales: {} };

// 磁盘上的全局默认（think.json 的 enabled，手工/配置界面修改）。会话内
// /lang think on|off 只改内存副本，落盘时必须写这个全局默认而不是会话
// 运行时值——否则任意会话 off 后的一次缓存写入会把 false 毒化进磁盘，
// 之后每个新会话都启动为关闭，且会话级 on 无法纠正（2026-11-14 故障根因）。
let diskEnabled = true;

function ensureLocale(cache: ThinkCache, locale: string): ThinkLocaleData {
	let data = cache.locales[locale];
	if (!data) {
		data = { tool: {}, param: {} };
		cache.locales[locale] = data;
	}
	return data;
}

export function loadCache(): ThinkCache {
	const cachePathValue = cachePath();
	try {
		if (!existsSync(cachePathValue)) {
			diskEnabled = true;
			return { ...DEFAULT_CACHE, locales: {} };
		}
		const raw = readFileSync(cachePathValue, "utf-8");
		const data = JSON.parse(raw) as Partial<ThinkCache>;
		// enabled 缺省为 true：文件是旧版本或字段损坏时，默认开启而不是静默关闭。
		diskEnabled = data?.enabled === false ? false : true;
		return {
			enabled: diskEnabled,
			locales: data?.locales ?? {},
		};
	} catch {
		diskEnabled = true;
		return { ...DEFAULT_CACHE, locales: {} };
	}
}

export function saveCache(cache: ThinkCache): void {
	try {
		mkdirSync(dirname(cachePath()), { recursive: true });
		// enabled 写磁盘全局默认，不写会话运行时值（见 diskEnabled 注释）。
		writeFileSync(cachePath(), JSON.stringify({ ...cache, enabled: diskEnabled }, null, 2), "utf-8");
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

/**
 * 会话内开关：只改本会话的内存副本，不写回磁盘。
 *
 * 之前 on/off 直接落盘，多个 pi 会话并行时互相覆盖（最后写的赢），导致
 * "我明明开了 think，新会话又关了"。开关本质是会话偏好；全局默认值由
 * think.json 的 enabled 承担（手工或未来配置界面修改）。
 */
export function setEnabled(cache: ThinkCache, enabled: boolean): void {
	cache.enabled = enabled;
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
