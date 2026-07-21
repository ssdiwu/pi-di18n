import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/slash-commands.js";
import { I18nRegistry } from "../src/registry.ts";
import { tSlashDescForTest } from "../src/core-hacks.ts";

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}
function loadMessages(locale: string): Record<string, string> {
	return loadBundle(locale).messages;
}

describe("slash command i18n coverage", () => {
	it("covers every pi 0.81 builtin slash command in en, zh-CN, and zh-TW bundles", () => {
		const en = loadMessages("en");
		const zhCN = loadMessages("zh-CN");
		const zhTW = loadMessages("zh-TW");
		expect(BUILTIN_SLASH_COMMANDS.length).toBeGreaterThan(0);
		for (const cmd of BUILTIN_SLASH_COMMANDS) {
			const key = `pi.slash.${cmd.name}.description`;
			expect(en[key], `missing en ${key}`).toBeTypeOf("string");
			// en baseline must match the current Pi source so 0.81 wording stays in sync
			// (e.g. /reload added "context files"). This catches stale baselines on upgrade.
			expect(en[key], `stale en baseline ${key}`).toBe(cmd.description);
			expect(zhCN[key], `missing zh-CN ${key}`).toBeTypeOf("string");
			expect(zhTW[key], `missing zh-TW ${key}`).toBeTypeOf("string");
			expect(zhCN[key], `zh-CN ${key} should be localized`).not.toBe(en[key]);
			expect(zhTW[key], `zh-TW ${key} should be localized`).not.toBe(en[key]);
		}
	});

	it("ships a static description for the Pi 0.81 built-in /llama extension command", () => {
		const en = loadMessages("en");
		const zhCN = loadMessages("zh-CN");
		const zhTW = loadMessages("zh-TW");
		const key = "pi.slash.llama.description";

		expect(en[key]).toBe("Manage llama.cpp router models");
		expect(zhCN[key]).toBeTypeOf("string");
		expect(zhTW[key]).toBeTypeOf("string");
		expect(zhCN[key]).not.toBe(en[key]);
		expect(zhTW[key]).not.toBe(en[key]);
	});

	it("makes zh-CN and zh-TW slash descriptions change all pi builtin descriptions", () => {
		for (const locale of ["zh-CN", "zh-TW"]) {
			const messages = loadMessages(locale);
			let changed = 0;
			for (const cmd of BUILTIN_SLASH_COMMANDS) {
				const key = `pi.slash.${cmd.name}.description`;
				if (messages[key] && messages[key] !== cmd.description) changed++;
			}
			expect(changed, `${locale} changed descriptions`).toBe(BUILTIN_SLASH_COMMANDS.length);
		}
	});
});

describe("slash command autocomplete description localization", () => {
	it("localizes /llama and preserves the autocomplete source tag prefix", () => {
		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		i18n.registerBundle(loadBundle("en"));
		i18n.registerBundle(loadBundle("zh-CN"));

		// Simulate the real autocomplete item shape: extension commands get a
		// "[t]"/"[u]" source tag prefix from InteractiveMode.prefixAutocompleteDescription,
		// and getSuggestions returns items with { value, label, description } (no name).
		const itemWithTag = {
			value: "llama",
			label: "llama",
			description: "[t] Manage llama.cpp router models",
		};
		const out = tSlashDescForTest(i18n as any, itemWithTag);
		expect(out).toBe("[t] 管理 llama.cpp 路由模型");
		expect(out).not.toContain("Manage");

		// Builtin commands have no source tag; translation is the bare value.
		const itemBare = {
			value: "reload",
			label: "reload",
			description: "Reload keybindings, extensions, skills, prompts, themes, and context files",
		};
		expect(tSlashDescForTest(i18n as any, itemBare)).toBe(
			"重新加载键位、扩展、技能、提示词、主题和上下文文件",
		);
	});
});
