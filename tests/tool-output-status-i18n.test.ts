import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateUiLineForTest } from "../src/core-hacks.ts";

const PACK_DIR = join(process.cwd(), "src/core-hacks-locales");
const TOOL_OUTPUT_STATUS = ["Tool output: expanded", "Tool output: collapsed"] as const;

function api(locale: string) {
	return { getLocale: () => locale } as any;
}

describe("Pi 0.83 tool output status localization", () => {
	it("localizes both states in every maintained non-English pack", () => {
		const locales = readdirSync(PACK_DIR)
			.filter((file) => file.endsWith(".json") && file !== "en.json")
			.map((file) => basename(file, ".json"))
			.sort();

		expect(locales).toEqual(["de", "es", "fr", "ja", "ko", "pt-BR", "zh-CN"]);

		for (const locale of locales) {
			for (const source of TOOL_OUTPUT_STATUS) {
				expect(translateUiLineForTest(api(locale), source), `${locale}: ${source}`).not.toBe(source);
			}
		}
	});

	it("uses native wording for simplified and traditional Chinese", () => {
		expect(translateUiLineForTest(api("zh-CN"), "Tool output: expanded")).toBe("工具输出：已展开");
		expect(translateUiLineForTest(api("zh-CN"), "Tool output: collapsed")).toBe("工具输出：已折叠");
		expect(translateUiLineForTest(api("zh-TW"), "Tool output: expanded")).toBe("工具輸出：已展開");
		expect(translateUiLineForTest(api("zh-TW"), "Tool output: collapsed")).toBe("工具輸出：已摺疊");
	});
});
