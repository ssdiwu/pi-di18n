import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { getCoreProbeDebug, installCoreHacks, uninstallCoreHacks } from "../src/core-hacks.ts";

// 让 findPiCodingAgentDistDir 解析到项目 node_modules 里的 pi-coding-agent dist，
// 使 installCoreHacks 能 patch 真实 InteractiveMode.prototype（测试环境 argv 不含 pi 入口）。
const PI_DIST = join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent/dist");

let InteractiveMode: any;

beforeAll(async () => {
	process.argv.push(join(PI_DIST, "core/slash-commands.js"));
	const i18n = new I18nRegistry({ locale: "en", fallbackLocale: "en" });
	await installCoreHacks(i18n as any);
	const mod: any = await import("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js");
	InteractiveMode = mod.InteractiveMode;
});

afterAll(async () => {
	await uninstallCoreHacks();
});

describe("patchedShowError / patchedShowWarning 健壮性（Spacer 崩溃回归）", () => {
	it("已对 InteractiveMode.prototype.showError 打补丁", () => {
		expect(InteractiveMode?.prototype?.showError?.__pi_i18n_patched__).toBe(true);
	});

	it("原生 showError 抛 ReferenceError（Spacer 瞬态）时降级，不冒泡成 uncaughtException", () => {
		const fake = Object.create(InteractiveMode.prototype);
		fake.chatContainer = { addChild() { throw new ReferenceError("Spacer is not defined"); }, children: [] };
		fake.ui = { requestRender() {} };
		expect(() => fake.showError("boom")).not.toThrow();
		// 降级必须被 probe 记成 unsafe，否则 /lang probe 看不到（AGENTS.md 验证手段）
		const pt = getCoreProbeDebug().points.find((p: any) => p.id === "interactive.showError");
		expect(pt?.state).toBe("unsafe");
		expect(pt?.reason).toContain("Spacer");
	});

	it("原生 showWarning 抛错时降级，不冒泡", () => {
		const fake = Object.create(InteractiveMode.prototype);
		fake.chatContainer = { addChild() { throw new Error("theme not initialized"); }, children: [] };
		fake.ui = { requestRender() {} };
		expect(() => fake.showWarning("boom")).not.toThrow();
		const pt = getCoreProbeDebug().points.find((p: any) => p.id === "interactive.showWarning");
		expect(pt?.state).toBe("unsafe");
		expect(pt?.reason).toContain("theme");
	});

	it("chatContainer 缺失时也不抛（防御 undefined 访问被 catch 兜住）", () => {
		const fake = Object.create(InteractiveMode.prototype);
		fake.chatContainer = undefined;
		fake.ui = { requestRender() {} };
		expect(() => fake.showError("boom")).not.toThrow();
	});
});
