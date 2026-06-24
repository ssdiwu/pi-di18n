// 预制 baseline 加载（三层翻译源的第①层）。
//
// 随包发布的 src/think-locales/*.json 是离线预制的 tool/param description 翻译。
// 第一版覆盖 12 种语言（ADR 0003），其余 locale 无 baseline，走运行时兜底。
//
// baseline 不存英文原文（它是开发期对应特定 pi 版本的源基准，版本匹配由开发者
// 在 pi 升级时重跑 scripts/export-think-baseline.mjs 保证）；运行时英文比对只用于缓存层。

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ThinkType } from "./types.ts";

// baseline 文件结构（与 src/think-locales/*.json 同构）：
//   { version, locale, tool: { name: "翻译" }, param: { "name:param": "翻译" } }
type BaselineFile = {
	version: number;
	locale: string;
	tool: Record<string, string>;
	param: Record<string, string>;
};

// locale -> { tool, param } 的纯翻译表。
const baselineByLocale = new Map<string, BaselineFile>();

let loaded = false;

function ensureLoaded(): void {
	if (loaded) return;
	loaded = true;
	let dir: string;
	try {
		dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "think-locales");
	} catch {
		return;
	}
	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
	} catch {
		return;
	}
	for (const f of files) {
		try {
			const raw = readFileSync(join(dir, f), "utf-8");
			const data = JSON.parse(raw) as BaselineFile;
			// en 是源基准（英文原文），不是翻译 baseline：跳过（ADR 0003）。
			if (data?.locale && data.locale !== "en") baselineByLocale.set(normalizeLocale(data.locale), data);
		} catch {
			// 跳过损坏的 baseline 文件
		}
	}
}

function normalizeLocale(input: string): string {
	return String(input || "").trim().replace(/_/g, "-").split(".")[0]!;
}

/** 查询某条 description 的预制翻译。无 baseline 或 key 不存在返回 undefined。 */
export function getBaselineTranslation(locale: string, type: ThinkType, key: string): string | undefined {
	ensureLoaded();
	const data = baselineByLocale.get(normalizeLocale(locale));
	if (!data) return undefined;
	const table = type === "tool" ? data.tool : data.param;
	const v = table[key];
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** 该 locale 是否有 baseline（用于诊断/预翻译决策）。 */
export function hasBaseline(locale: string): boolean {
	ensureLoaded();
	return baselineByLocale.has(normalizeLocale(locale));
}

/** 统计某 locale 的 baseline 条数（tool + param），用于 doctor 诊断。 */
export function countBaseline(locale: string): { tool: number; param: number } {
	ensureLoaded();
	const data = baselineByLocale.get(normalizeLocale(locale));
	if (!data) return { tool: 0, param: 0 };
	return { tool: Object.keys(data.tool).length, param: Object.keys(data.param).length };
}
