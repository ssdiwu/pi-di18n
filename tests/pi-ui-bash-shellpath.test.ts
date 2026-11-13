import { beforeEach, describe, expect, it, vi } from "vitest";
import type { I18nApi } from "../src/types.ts";

const { createBashToolCalls } = vi.hoisted(() => ({
	createBashToolCalls: [] as Array<{ cwd: string; options?: unknown }>,
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	createBashTool: (cwd: string, options?: unknown) => {
		createBashToolCalls.push({ cwd, options });
		return {
			description: "bash",
			parameters: {},
			async execute() {
				return { content: [{ type: "text", text: "exit code: 0" }], details: undefined };
			},
		};
	},
	createReadTool: () => ({ description: "read", parameters: {}, async execute() { return { content: [{ type: "text", text: "" }] }; } }),
	createEditTool: () => ({ description: "edit", parameters: {}, async execute() { return { content: [{ type: "text", text: "" }] }; } }),
	createWriteTool: () => ({ description: "write", parameters: {}, async execute() { return { content: [{ type: "text", text: "" }] }; } }),
	keyHint: (id: string) => id,
	SettingsManager: {
		// Mirror the real manager: an empty/blank path normalizes to undefined.
		inMemory: (settings: { shellPath?: string; shellCommandPrefix?: string }) => ({
			getShellPath: () => (settings.shellPath?.trim() ? settings.shellPath : undefined),
			getShellCommandPrefix: () => settings.shellCommandPrefix,
		}),
		create: () => ({
			getShellPath: () => undefined,
			getShellCommandPrefix: () => undefined,
		}),
	},
}));

function makeI18n(): I18nApi {
	return {
		getLocale: () => "zh-CN",
		setLocale: () => {},
		getFallbackLocale: () => "en",
		setFallbackLocale: () => {},
		registerBundle: () => ({ ok: true, errors: [] }),
		t: (key: string) => key,
		onLocaleChanged: () => () => {},
		doctor: () => ({ issues: [] }),
		listNamespaces: () => [],
	} as unknown as I18nApi;
}

type SettingsFixture = { shellPath?: string } | undefined;

function makePi(getSettings?: () => SettingsFixture) {
	const tools: Array<{ name: string; execute: (...args: any[]) => Promise<unknown> }> = [];
	const pi: Record<string, unknown> = {
		events: { on() {} },
		registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<unknown> }) => {
			tools.push(tool);
		},
	};
	if (getSettings) pi.getSettings = getSettings;
	const bashTool = () => tools.find((t) => t.name === "bash")!;
	const executeBash = async (cwd = "/tmp/pi-di18n-test") => {
		await bashTool().execute("call-1", { command: "echo hi" }, undefined, undefined, { cwd });
	};
	return { pi, bashTool, executeBash };
}

async function loadPiUi() {
	vi.resetModules();
	return await import("../src/pi-ui.ts");
}

beforeEach(() => {
	createBashToolCalls.length = 0;
	vi.resetModules(); // installLocalizedToolsOnce is guarded by module state; reset per test.
});

describe("bash tool override forwards settings.shellPath (issue #6)", () => {
	it("passes shellPath from pi.getSettings() to createBashTool at execute time", async () => {
		const { installLocalizedToolsOnce, resolveBashToolOptions } = await loadPiUi();
		const { pi, executeBash } = makePi(() => ({ shellPath: "/bin/bash" }));

		installLocalizedToolsOnce(pi as any, makeI18n());
		await executeBash("/tmp/workdir");

		expect(resolveBashToolOptions(pi as any, {}).shellPath).toBe("/bin/bash");
		// call[0]: install-time metadata tool (cwd only); call[1]: execute-time rebuild.
		expect(createBashToolCalls.length).toBe(2);
		expect(createBashToolCalls[1]).toEqual({ cwd: "/tmp/workdir", options: { shellPath: "/bin/bash", commandPrefix: undefined } });
	});

	it("reads settings on every execute instead of caching the install-time snapshot", async () => {
		let settings: SettingsFixture = { shellPath: "/bin/bash" };
		const { pi, executeBash } = makePi(() => settings);

		const { installLocalizedToolsOnce } = await loadPiUi();
		installLocalizedToolsOnce(pi as any, makeI18n());

		await executeBash();
		expect(createBashToolCalls[1]?.options).toEqual({ shellPath: "/bin/bash", commandPrefix: undefined });

		settings = { shellPath: "/opt/homebrew/bin/bash" };
		await executeBash();
		expect(createBashToolCalls[2]?.options).toEqual({ shellPath: "/opt/homebrew/bin/bash", commandPrefix: undefined });

		settings = undefined;
		await executeBash();
		expect(createBashToolCalls[3]?.options).toEqual({ shellPath: undefined, commandPrefix: undefined });
	});

	it("falls back to default shell when shellPath is missing or blank", async () => {
		const { pi, executeBash } = makePi(() => ({ shellPath: "   " }));

		const { installLocalizedToolsOnce } = await loadPiUi();
		installLocalizedToolsOnce(pi as any, makeI18n());
		await executeBash();

		expect(createBashToolCalls[1]?.options).toEqual({ shellPath: undefined, commandPrefix: undefined });
	});

	it("keeps default shell when the pi runtime has no settings API or it throws", async () => {
		const { resolveBashToolOptions } = await loadPiUi();

		expect(resolveBashToolOptions({} as any, {}).shellPath).toBeUndefined();
		expect(
			resolveBashToolOptions(
				{
					getSettings: () => {
						throw new Error("Extension runtime not initialized");
					},
				} as any,
				{},
			).shellPath,
		).toBeUndefined();

		const { pi, executeBash } = makePi(); // no getSettings at all
		const { installLocalizedToolsOnce } = await loadPiUi();
		installLocalizedToolsOnce(pi as any, makeI18n());
		await expect(executeBash()).resolves.toBeUndefined();
		expect(createBashToolCalls[1]?.options).toEqual({ shellPath: undefined, commandPrefix: undefined });
	});
});
