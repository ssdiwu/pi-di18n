import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateUiLineForTest } from "../src/core-hacks.ts";

// core-hacks 词典包契约：
// 1. en.json 的 exact 必须为空——英文原文即显示，加条目会让 en locale 把英文替换成自己。
// 2. zh-CN 是键集基准，其它 locale 必须覆盖全部 zh-CN 键（缺失即该语言残留英文）。
// 3. zh-TW.json 以 zh-CN 为基生成，并统一台湾术语；核心 UI 行仍由 zh-TW legacy 表负责
//    （byte-for-byte 守卫），pack 供 /hotkeys 子串替换与后续迁移使用。
const PACK_DIR = join(process.cwd(), "src/core-hacks-locales");

function readPack(file: string): { version: number; locale: string; exact: Record<string, string> } {
	return JSON.parse(readFileSync(join(PACK_DIR, file), "utf8"));
}

function api(locale: string) {
	return { getLocale: () => locale } as any;
}

const PACK_FILES = ["de.json", "es.json", "fr.json", "ja.json", "ko.json", "pt-BR.json", "zh-CN.json", "zh-TW.json"];

describe("core-hacks 词典包对齐", () => {
	it("keeps en.json exact empty", () => {
		const en = readPack("en.json");
		expect(Object.keys(en.exact)).toEqual([]);
	});

	it("ships every maintained pack", () => {
		const files = readdirSync(PACK_DIR).filter((f) => f.endsWith(".json")).sort();
		expect(files).toEqual(["de.json", "en.json", "es.json", "fr.json", "ja.json", "ko.json", "pt-BR.json", "zh-CN.json", "zh-TW.json"]);
	});

	it("covers every zh-CN key in each maintained locale", () => {
		const zhKeys = Object.keys(readPack("zh-CN.json").exact);
		for (const file of PACK_FILES) {
			if (file === "zh-CN.json") continue;
			const exact = readPack(file).exact;
			const missing = zhKeys.filter((k) => !(k in exact));
			expect(missing, `${file}: missing ${missing.length} zh-CN keys`).toEqual([]);
			for (const key of zhKeys) {
				expect(typeof exact[key], `${file}: ${key}`).toBe("string");
				expect(exact[key].length, `${file}: ${key}`).toBeGreaterThan(0);
			}
		}
	});

	it("keeps the legacy pi ≤0.83 anchors the legacy table still owns", () => {
		// 这些键在 pi 1.1.0 后 zh-CN 已改措辞；其余语言与 zh-TW 沿用 legacy 措辞，
		// 且被 settings-localization.test.ts 的 LEGACY_SETTINGS 断言保护。
		const legacyAnchor = "Show transcript notices for significant prompt-cache misses";
		for (const file of PACK_FILES) {
			if (file === "zh-CN.json") continue;
			expect(readPack(file).exact[legacyAnchor], `${file}: ${legacyAnchor}`).toBeTypeOf("string");
		}
	});

	it("uses Taiwan terminology in zh-TW instead of mainland wording", () => {
		const exact = readPack("zh-TW.json").exact;
		expect(exact["No providers logged in. Use /login first."]).toBe("沒有已登入的供應商，請先使用 /login。");
		expect(exact["Delete session?"]).toBe("刪除工作階段？");
		expect(exact[" ✓ configured"]).toBe(" ✓ 已設定");
		expect(exact["idle"]).toBe("閒置");
		expect(exact["streaming"]).toBe("串流");

		// 大陆惯用词不得出现。
		for (const [key, value] of Object.entries(exact)) {
			for (const mainland of ["提供商", "擴充套件", "流式", "空閒", "配置", "智慧體", "會話"]) {
				expect(value.includes(mainland), `${key}: 残留 ${mainland}`).toBe(false);
			}
		}
	});

	it("keeps the zh-TW runtime rendering on the legacy table", () => {
		// 核心 UI 行走 legacy 表（byte-for-byte 守卫），pack 不得改变它已经产出的文案。
		// 例外：legacy 尚未翻译的 3 个键，pack 提供了更准确的台湾译法，但运行时仍用 legacy 结果。
		const exact = readPack("zh-TW.json").exact;
		const zhTW = api("zh-TW");
		const legacyGaps = new Set([
			"Tokens",
			"Type to filter · Enter to select · Esc to go back",
			"  Type to filter · Enter to select · Esc to go back",
		]);
		for (const key of Object.keys(exact)) {
			const legacy = translateUiLineForTest(zhTW, key);
			if (legacy === key) continue; // legacy 未覆盖，pack 负责
			if (legacyGaps.has(key)) {
				expect(legacy, `zh-TW legacy 输出不应被改动: ${key}`).toBeTypeOf("string");
				expect(exact[key], `zh-TW pack: ${key}`).not.toBe(legacy);
				continue;
			}
			expect(exact[key], `zh-TW: ${key}`).toBe(legacy);
		}
	});
});
