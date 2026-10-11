import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateUiLineForTest } from "../src/core-hacks.ts";

const PACK_DIR = join(process.cwd(), "src/core-hacks-locales");
// pi ≤0.83 legacy anchors: still present in every pack except zh-CN (which moved to the 1.1.0 wording).
const LEGACY_SETTINGS = [
	"Show transcript notices for significant prompt-cache misses",
	"Horizontal padding for user messages, assistant messages, and thinking",
] as const;
const SHARED_SETTINGS = ["Cache miss notices", "Output padding"] as const;
// pi 1.1.0 wording: zh-CN first; other packs pending backfill.
const SETTINGS_1_1 = [
	"Show transcript notices for cache costs and provider recovery diagnostics",
	"Horizontal padding for messages, tool output, and command output",
] as const;

function api(locale: string) {
	return { getLocale: () => locale } as any;
}

describe("pi 0.79 new settings localization", () => {
	it("keeps every maintained non-English pack complete", () => {
		const files = readdirSync(PACK_DIR).filter((file) => file.endsWith(".json") && file !== "en.json").sort();
		expect(files).toEqual(["de.json", "es.json", "fr.json", "ja.json", "ko.json", "pt-BR.json", "zh-CN.json"]);

		for (const file of files) {
			const pack = JSON.parse(readFileSync(join(PACK_DIR, file), "utf8"));
			const settings = file === "zh-CN.json" ? [...SHARED_SETTINGS, ...SETTINGS_1_1] : [...SHARED_SETTINGS, ...LEGACY_SETTINGS];
			for (const source of settings) {
				expect(pack.exact[source], `${file}: ${source}`).toBeTypeOf("string");
				expect(pack.exact[source], `${file}: ${source}`).not.toBe(source);
			}
		}
	});

	it("translates zh-CN setting descriptions and selected values", () => {
		const zhCN = api("zh-CN");

	expect(translateUiLineForTest(zhCN, "Show transcript notices for cache costs and provider recovery diagnostics")).toBe(
		"显示缓存成本与提供商恢复诊断的记录提示",
	);
	expect(translateUiLineForTest(zhCN, "Horizontal padding for messages, tool output, and command output")).toBe(
		"消息、工具输出和命令输出的水平内距",
	);
		expect(translateUiLineForTest(zhCN, "→ Cache miss notices false")).toBe("→ 缓存未命中提示 关");
		expect(translateUiLineForTest(zhCN, "→ Cache miss notices true")).toBe("→ 缓存未命中提示 开");
		expect(translateUiLineForTest(zhCN, "  Output padding 1")).toBe("  输出内距 1");
	});

	it("keeps zh-TW legacy localization complete", () => {
		const zhTW = api("zh-TW");

		expect(translateUiLineForTest(zhTW, "Cache miss notices")).toBe("快取未命中通知");
		expect(translateUiLineForTest(zhTW, "Show transcript notices for significant prompt-cache misses")).toBe(
			"顯示重大提示快取未命中的記錄通知",
		);
		expect(translateUiLineForTest(zhTW, "Output padding")).toBe("輸出內距");
		expect(translateUiLineForTest(zhTW, "Horizontal padding for user messages, assistant messages, and thinking")).toBe(
			"使用者訊息、助理訊息與思考的水平內距",
		);
	});
});
