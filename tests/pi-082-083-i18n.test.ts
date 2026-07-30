import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateUiLineForTest } from "../src/core-hacks.ts";

const THINK_LOCALES_DIR = join(process.cwd(), "src", "think-locales");

function api(locale: string) {
	return { getLocale: () => locale } as any;
}

const UI_CASES = [
	{ source: "Model unavailable", residual: /Model unavailable|unavailable/i },
	{ source: "→ ghost/model [unavailable] ✗", residual: /unavailable/i },
	{
		source: "ctrl+s save · 0/0 enabled · 1 unavailable",
		residual: /\bsave\b|\benabled\b|\bunavailable\b/i,
	},
	{
		source: "Select authentication method for OpenRouter:",
		residual: /Select authentication method/i,
	},
	{ source: "Sign in with OpenRouter", residual: /Sign in with/i },
	{ source: "Sign in with an API key", residual: /Sign in with|API key/i },
	{
		source: "Complete sign-in in your browser. If the browser is on another machine, paste the final redirect URL here.",
		residual: /Complete sign-in|browser|redirect URL/i,
	},
	{
		source: "Complete sign-in in your browser, or paste the authorization code / redirect URL here:",
		residual: /Complete sign-in|browser|authorization code|redirect URL/i,
	},
] as const;

describe("Pi 0.82/0.83 TUI localization coverage", () => {
	it.each(["zh-CN", "zh-TW"])("localizes scoped-model and provider-login additions for %s", (locale) => {
		for (const { source, residual } of UI_CASES) {
			const output = translateUiLineForTest(api(locale), source);
			expect(output, `${locale}: ${source}`).not.toBe(source);
			expect(output, `${locale}: ${source}`).not.toMatch(residual);
		}
	});
});

describe("Pi read-tool think baseline", () => {
	it("keeps every shipped locale synchronized with current bmp support", () => {
		const localeFiles = readdirSync(THINK_LOCALES_DIR)
			.filter((file) => file.endsWith(".json"))
			.sort();
		expect(localeFiles.length).toBeGreaterThan(0);

		for (const file of localeFiles) {
			const bundle = JSON.parse(readFileSync(join(THINK_LOCALES_DIR, file), "utf8"));
			expect(bundle.tool?.read, `${file}: missing tool.read`).toBeTypeOf("string");
			expect(bundle.tool.read, `${file}: stale read formats`).toMatch(/\bbmp\b/i);
		}
	});
});
