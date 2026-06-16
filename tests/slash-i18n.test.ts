import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/slash-commands.js";

function loadMessages(locale: string): Record<string, string> {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	const bundle = JSON.parse(readFileSync(path, "utf-8"));
	return bundle.messages;
}

describe("slash command i18n coverage", () => {
	it("covers every pi 0.79 builtin slash command in en, zh-CN, and zh-TW bundles", () => {
		const en = loadMessages("en");
		const zhCN = loadMessages("zh-CN");
		const zhTW = loadMessages("zh-TW");
		const commands = BUILTIN_SLASH_COMMANDS.map((cmd) => cmd.name).sort();

		expect(commands.length).toBeGreaterThan(0);
		for (const name of commands) {
			const key = `pi.slash.${name}.description`;
			expect(en[key], `missing en ${key}`).toBeTypeOf("string");
			expect(zhCN[key], `missing zh-CN ${key}`).toBeTypeOf("string");
			expect(zhTW[key], `missing zh-TW ${key}`).toBeTypeOf("string");
			expect(zhCN[key], `zh-CN ${key} should be localized`).not.toBe(en[key]);
			expect(zhTW[key], `zh-TW ${key} should be localized`).not.toBe(en[key]);
		}
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
