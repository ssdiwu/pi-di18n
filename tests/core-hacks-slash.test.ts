import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { getSlashDescMode, installCoreHacks, uninstallCoreHacks } from "../src/core-hacks.ts";
import { BUILTIN_SLASH_COMMANDS } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/slash-commands.js";

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

describe("core-hacks slash command patch", () => {
	it("patches pi 0.79 builtin slash descriptions for zh-CN and reports primary mode", async () => {
		const piDistCli = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
		if (!process.argv.includes(piDistCli)) process.argv.unshift(piDistCli);

		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		const compact = BUILTIN_SLASH_COMMANDS.find((cmd) => cmd.name === "compact");
		const originalCompactDescription = compact?.description;

		const res = await installCoreHacks(i18n);
		expect(res.ok).toBe(true);
		expect(getSlashDescMode().mode).toBe("primary");
		expect(compact?.description).toBe("手动压缩会话上下文");

		await uninstallCoreHacks();
		expect(compact?.description).toBe(originalCompactDescription);
	});
});
