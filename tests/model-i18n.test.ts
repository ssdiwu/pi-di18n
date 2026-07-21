import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { translateUiLineForTest } from "../src/core-hacks.ts";

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

function api(locale: string) {
	const i18n = new I18nRegistry({ locale, fallbackLocale: "en" });
	i18n.registerBundle(loadBundle("en"));
	i18n.registerBundle(loadBundle(locale));
	return i18n;
}

// Pi 0.80.8+ /model selector background catalog-refresh status messages
// (dist/modes/interactive/components/model-selector.js).
const REFRESH_STATUS = [
	"Refreshing model catalogs…",
	"Model refresh timed out; showing cached models.",
	"Could not refresh openai; showing cached models.",
	"Could not refresh 3 model catalogs; showing cached models.",
	"Model catalogs refreshed.",
] as const;

describe("Pi 0.81 /model refresh status localization", () => {
	it("localizes every zh-CN refresh status line while keeping dynamic provider/counts", () => {
		const zhCN = api("zh-CN");

		for (const line of REFRESH_STATUS) {
			const out = translateUiLineForTest(zhCN as any, line);
			expect(out, line).not.toBe(line);
			expect(out, line).not.toMatch(/Refresh|catalog|cached/i);
		}

		// dynamic fragments must survive translation
		expect(translateUiLineForTest(zhCN as any, "Could not refresh openai; showing cached models.")).toContain("openai");
		expect(translateUiLineForTest(zhCN as any, "Could not refresh 3 model catalogs; showing cached models.")).toContain("3");
	});
});
