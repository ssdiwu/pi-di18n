import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateUiLineForTest } from "../src/core-hacks.ts";

const PACK_DIR = join(process.cwd(), "src/core-hacks-locales");
const NEW_SETTINGS = [
	"Cache miss notices",
	"Show transcript notices for significant prompt-cache misses",
	"Output padding",
	"Horizontal padding for user messages, assistant messages, and thinking",
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
			for (const source of NEW_SETTINGS) {
				expect(pack.exact[source], `${file}: ${source}`).toBeTypeOf("string");
				expect(pack.exact[source], `${file}: ${source}`).not.toBe(source);
			}
		}
	});

	it("translates zh-CN setting descriptions and selected values", () => {
		const zhCN = api("zh-CN");

		expect(translateUiLineForTest(zhCN, "Show transcript notices for significant prompt-cache misses")).toBe(
			"提示缓存明显未命中时显示记录提示",
		);
		expect(translateUiLineForTest(zhCN, "Horizontal padding for user messages, assistant messages, and thinking")).toBe(
			"用户消息、助手消息和思考内容的水平内距",
		);
		expect(translateUiLineForTest(zhCN, "→ Cache miss notices false")).toBe("→ 缓存未命中提示 关");
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
