import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getCoreProbeDebug,
	installCoreHacks,
	patchLoginDialogRenderForTest,
	resetCoreProbe,
	setCoreProbeEnabled,
	uninstallCoreHacks,
} from "../src/core-hacks.ts";

const zhCN = { getLocale: () => "zh-CN" } as any;
const PI_DIST_CLI = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
if (!process.argv.includes(PI_DIST_CLI)) process.argv.unshift(PI_DIST_CLI);

describe("Pi provider login dialog localization", () => {
	beforeEach(() => {
		resetCoreProbe();
		setCoreProbeEnabled(true);
	});

	it("localizes dynamically-added OpenRouter login instructions", () => {
		const proto = {
			render() {
				return [
					"Login to OpenRouter",
					"Complete sign-in in your browser, or paste the authorization code / redirect URL here:",
				];
			},
		};
		patchLoginDialogRenderForTest(proto, zhCN);

		const lines = proto.render();

		expect(lines[0]).not.toMatch(/^Login to/);
		expect(lines[1]).not.toMatch(/Complete sign-in|authorization code|redirect URL/i);
	});

	it("returns an empty render instead of interrupting login when upstream rendering throws", () => {
		const proto = {
			render(): string[] {
				throw new Error("login renderer failed");
			},
		};
		patchLoginDialogRenderForTest(proto, zhCN);

		expect(() => proto.render()).not.toThrow();
		expect(proto.render()).toEqual([]);
		const point = getCoreProbeDebug().points.find((item: any) => item.id === "interactive.loginDialog.render");
		expect(point?.state).toBe("unsafe");
	});

	it("restores the real login renderer when core hacks are uninstalled", async () => {
		await uninstallCoreHacks();
		const { LoginDialogComponent } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/login-dialog.js"
		);
		const original = LoginDialogComponent.prototype.render;

		await installCoreHacks(zhCN);
		expect(LoginDialogComponent.prototype.render).not.toBe(original);

		await uninstallCoreHacks();
		expect(LoginDialogComponent.prototype.render).toBe(original);
	});
});
