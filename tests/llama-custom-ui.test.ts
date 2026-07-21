import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { getCoreProbeDebug, installCoreHacks, uninstallCoreHacks } from "../src/core-hacks.ts";

const PI_DIST = join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent/dist");

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

let InteractiveMode: any;

beforeAll(async () => {
	process.argv.push(join(PI_DIST, "core/slash-commands.js"));
	const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
	i18n.registerBundle(loadBundle("en"));
	i18n.registerBundle(loadBundle("zh-CN"));
	await installCoreHacks(i18n as any);
	const mod: any = await import("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js");
	InteractiveMode = mod.InteractiveMode;
});

afterAll(async () => {
	await uninstallCoreHacks();
});

describe("Pi 0.81 /llama showExtensionCustom localization", () => {
	it("patches showExtensionCustom and localizes rendered custom-component lines", async () => {
		expect(InteractiveMode?.prototype?.showExtensionCustom?.__pi_i18n_patched__).toBe(true);

		// Simulate a custom component (e.g. LlamaView) whose render() returns fixed English lines.
		const component = {
			render(_w: number) {
				return ["llama.cpp models", "Loading model", "Download model…"];
			},
		};

		// Patched showExtensionCustom wraps the factory and patches the returned component's
		// render so localized lines reach the user without touching the business Promise.
		const mode: any = Object.create(InteractiveMode.prototype);
		mode.editor = { getText: () => "", setText: () => {} };
		mode.editorContainer = { clear() {}, addChild() {} };
		mode.ui = { setFocus() {}, requestRender() {}, showOverlay() { return {}; }, hideOverlay() {} };

		await mode.showExtensionCustom((_tui: any, _theme: any, _kb: any, close: any) => {
			setTimeout(close, 0);
			return component;
		});

		// Force a render and read the lines after localization patched the instance.
		const lines = component.render(80);
		expect(lines.some((l: string) => l.includes("模型") || l.includes("下载") || l.includes("加载"))).toBe(true);
	});

	it("degrades to original lines when line localization throws, never swallowing render output", async () => {
		const mode: any = Object.create(InteractiveMode.prototype);
		mode.editor = { getText: () => "", setText: () => {} };
		mode.editorContainer = { clear() {}, addChild() {} };
		mode.ui = { setFocus() {}, requestRender() {}, showOverlay() { return {}; }, hideOverlay() {} };

		// render returns lines; localization (tUiLine) must not lose them if it throws.
		const component = { render: () => ["llama.cpp models", "Download model…"] };

		await mode.showExtensionCustom((_t: any, _th: any, _kb: any, close: any) => {
			setTimeout(close, 0);
			return component;
		});

		// Simulate a broken i18n so tUiLine throws inside the patched render.
		const orig = (globalThis as any).__pi_i18n_current_api__;
		(globalThis as any).__pi_i18n_current_api__ = { getLocale: () => { throw new Error("i18n broken"); }, t: () => { throw new Error("i18n broken"); } };
		try {
			const lines = component.render(80);
			expect(lines).toEqual(["llama.cpp models", "Download model…"]);
		} finally {
			(globalThis as any).__pi_i18n_current_api__ = orig;
		}

		const pt = getCoreProbeDebug().points.find((p: any) => p.id === "interactive.showExtensionCustom");
		expect(pt?.state === "matched" || pt?.state === "unsafe").toBe(true);
	});
});
