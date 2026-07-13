import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { I18nRegistry } from "../src/registry.ts";
import { installCoreHacks, uninstallCoreHacks } from "../src/core-hacks.ts";

function loadBundle(locale: string) {
	return requireJson(join(process.cwd(), "locales", `${locale}.json`));
}

function requireJson(path: string) {
	return JSON.parse(readFileSync(path, "utf-8"));
}

function formatTokensForTest(count: number) {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

async function setup(locale = "zh-CN") {
	const piDistCli = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
	if (!process.argv.includes(piDistCli)) process.argv.unshift(piDistCli);
	await uninstallCoreHacks();
	const { InteractiveMode } = await import(
		"../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js"
	);
	// The published local 0.79.10 fixture predates this upstream method; model
	// its exact output so the patch contract is testable on both package layouts.
	if (!(InteractiveMode.prototype as any).addCacheMissNotice) {
		(InteractiveMode.prototype as any).addCacheMissNotice = function (miss: any) {
			if (miss.missedTokens < 20_000 && miss.missedCost < 0.1) return;
			const cost = miss.missedCost >= 0.01 ? ` (~$${miss.missedCost.toFixed(2)})` : "";
			const reBilled = `${formatTokensForTest(miss.missedTokens)} tokens re-billed${cost}`;
			let label = "Cache miss";
			if (miss.modelChanged) label = "Cache miss after model switch";
			else if (miss.idleMs >= 5 * 60_000) label = `Cache miss after ${Math.round(miss.idleMs / 60_000)}m idle`;
			this.chatContainer.addChild({
				text: `${label}: ${reBilled}`,
				getText() { return this.text; },
				setText(value: string) { this.text = value; },
			});
		};
	}
	const i18n = new I18nRegistry({ locale, fallbackLocale: "en" });
	expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
	expect(i18n.registerBundle(loadBundle(locale)).ok).toBe(true);
	expect((await installCoreHacks(i18n)).ok).toBe(true);
	return i18n;
}

describe("cache miss notice core patch", () => {
	beforeEach(async () => {
		await uninstallCoreHacks();
	});

	it("localizes the dynamic model-switch notice while preserving runtime values", async () => {
		await setup("zh-CN");
		const { InteractiveMode } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js"
		);
		const children: any[] = [];
		const mode = { chatContainer: { children, addChild(child: any) { children.push(child); } } };

		(InteractiveMode.prototype as any).addCacheMissNotice.call(mode, {
			missedTokens: 25_000,
			missedCost: 0.32,
			modelChanged: true,
			idleMs: 0,
		});

		const text = children.at(-1)?.getText?.() ?? children.at(-1)?.text;
		expect(text).toContain("切换模型后缓存未命中");
		expect(text).toContain("25k");
		expect(text).toContain("0.32");
		expect(text).not.toContain("Cache miss");
		await uninstallCoreHacks();
	});

	it("localizes the idle notice and keeps the upstream threshold behavior", async () => {
		await setup("ja");
		const { InteractiveMode } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js"
		);
		const children: any[] = [];
		const mode = { chatContainer: { children, addChild(child: any) { children.push(child); } } };

		(InteractiveMode.prototype as any).addCacheMissNotice.call(mode, {
			missedTokens: 42_000,
			missedCost: 0.11,
			modelChanged: false,
			idleMs: 7 * 60_000,
		});

		const text = children.at(-1)?.getText?.() ?? children.at(-1)?.text;
		expect(text).toContain("7分間アイドル後");
		expect(text).toContain("42k");
		expect(text).toContain("0.11");
		await uninstallCoreHacks();
	});

	it("does not throw when upstream chat rendering fails", async () => {
		await setup("zh-CN");
		const { InteractiveMode } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js"
		);
		const mode = { chatContainer: { children: [], addChild() { throw new Error("Spacer is not defined"); } } };

		expect(() => (InteractiveMode.prototype as any).addCacheMissNotice.call(mode, {
			missedTokens: 25_000,
			missedCost: 0.32,
			modelChanged: false,
			idleMs: 0,
		})).not.toThrow();
		await uninstallCoreHacks();
	});
});
