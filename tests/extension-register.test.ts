import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import extension from "../index.ts";

describe("extension registration", () => {
	it("registers lang command, locale tool, localized tool overrides, and compaction hooks", async () => {
		const hooks: string[] = [];
		const eventHandlers: string[] = [];
		const eventListeners = new Map<string, (payload: any) => void>();
		const commands: string[] = [];
		const tools: string[] = [];
		let localeTool: any;

		const pi = {
			events: {
				on(name: string, handler?: (payload: any) => void) {
					eventHandlers.push(name);
					if (handler) eventListeners.set(name, handler);
				},
				emit() {},
			},
			on(name: string) {
				hooks.push(name);
			},
			registerCommand(name: string) {
				commands.push(name);
			},
			registerTool(tool: { name: string }) {
				tools.push(tool.name);
				if (tool.name === "i18n_get_locale") localeTool = tool;
			},
			getCommands() {
				return [];
			},
		};

		const stateDir = mkdtempSync(join(tmpdir(), "pi-di18n-extension-test-"));
		const previousStateDir = process.env.PI_DI18N_STATE_DIR;
		process.env.PI_DI18N_STATE_DIR = stateDir;
		try {
			extension(pi as any);
		} finally {
			if (previousStateDir === undefined) delete process.env.PI_DI18N_STATE_DIR;
			else process.env.PI_DI18N_STATE_DIR = previousStateDir;
			rmSync(stateDir, { recursive: true, force: true });
		}

		expect(hooks).toContain("session_start");
		expect(hooks).toContain("session_before_compact");
		expect(hooks).toContain("session_before_tree");
		expect(hooks).toContain("before_provider_request");
		expect(commands).toContain("lang");
		expect(tools).toEqual(expect.arrayContaining(["read", "bash", "edit", "write", "i18n_get_locale"]));
		expect(eventHandlers).toContain("pi-i18n/requestApi");
		expect(eventHandlers).toContain("pi-core/i18n/requestApi");
		expect(typeof localeTool.renderResult).toBe("function");
		const theme = { fg: (_: string, text: string) => text };
		const result = await localeTool.execute();
		expect(result.content).toEqual([{ type: "text", text: "en" }]);
		expect(result.details).toMatchObject({ locale: "en", fallbackLocale: "en", source: "default" });
		expect(result.details.shippedLocaleCount).toBeGreaterThan(0);
		expect(result.details.shippedLocales).toHaveLength(result.details.shippedLocaleCount);

		const renderResult = { content: [{ type: "text", text: "en" }], details: { locale: "hidden", fallbackLocale: "fallback", source: "environment", shippedLocaleCount: 2, shippedLocales: ["en", "zh-CN"] } };
		const compact = localeTool.renderResult(renderResult, { expanded: false, isPartial: false }, theme).render(80).join("\n");
		expect(compact).toContain("Locale: en");
		expect(compact).toContain("expand");
		expect(compact).not.toContain("hidden");
		const expanded = localeTool.renderResult(renderResult, { expanded: true, isPartial: false }, theme).render(80).join("\n");
		expect(expanded).toContain("Current locale: en");
		expect(expanded).toContain("Source: environment");
		expect(expanded).toContain("Fallback locale: fallback");
		expect(expanded).toContain("Built-in UI locales (2): en, zh-CN");
		expect(expanded).not.toContain("hidden");
		const partial = localeTool.renderResult(renderResult, { expanded: false, isPartial: true }, theme).render(80).join("\n");
		expect(partial.trimEnd()).toBe("Running…");

		let i18nApi: any;
		eventListeners.get("pi-core/i18n/requestApi")?.({ reply: (api: any) => { i18nApi = api; } });
		i18nApi.setLocale("zh-CN");
		const localized = localeTool.renderResult(renderResult, { expanded: true, isPartial: false }, theme).render(80).join("\n");
		expect(localized).toContain("当前语言：en");
		expect(localized).toContain("来源：环境变量");
		expect(localized).toContain("回退语言：fallback");
		for (const locale of result.details.shippedLocales) {
			i18nApi.setLocale(locale);
			expect(i18nApi.doctor().issues.filter((issue: { key: string }) => issue.key.startsWith("tool.locale."))).toEqual([]);
		}
		for (const locale of ["de", "es", "fr", "hi", "id", "ja", "ko", "pt-BR", "vi"]) {
			i18nApi.setLocale(locale);
			const translated = localeTool.renderResult(renderResult, { expanded: true, isPartial: false }, theme).render(80).join("\n");
			expect(translated).not.toContain("Current locale:");
			expect(translated).not.toContain("Source: environment");
		}
	});
});
