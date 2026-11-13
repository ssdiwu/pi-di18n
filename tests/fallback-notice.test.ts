import { describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => {
	process.env.PI_DI18N_STATE_DIR = "/dev/null";
	process.env.PI_CODING_AGENT_DIR = "/dev/null";
	return { locale: "en" };
});
vi.mock("../src/config", async (original) => ({
	...await original<Record<string, unknown>>(),
	loadI18nConfig: () => ({ source: "user", config: { locale: settings.locale, coreHacksEnabled: false } }),
	detectLocaleFromEnv: () => "",
}));
vi.mock("../src/core-hacks", async (original) => ({
	...await original<Record<string, unknown>>(),
	installCoreHacks: async () => {}, uninstallCoreHacks: async () => {},
	setCoreProbeEnabled: () => {}, shouldWarnCoreMisalignment: () => true,
}));
vi.mock("../src/pi-ui", async (original) => ({
	...await original<Record<string, unknown>>(),
	installLocalizedToolsOnce: () => {}, applyLocalizedFooter: () => {}, applyLocalizedHeader: () => {},
}));
vi.mock("../src/ui-localize/localize", () => ({ prefetchUiDescriptionsOnSessionStart: () => {} }));
vi.mock("../src/think/localize", () => ({
	prefetchOnSessionStart: () => {}, applyOnProviderRequest: () => {}, commandThink: () => {}, getThinkDebug: () => "",
}));

const notices = [
	["en", "i18n: slash command descriptions use the autocomplete fallback."],
	["zh-CN", "i18n：slash 命令描述通过补全回退路径本地化。"],
	["zh-TW", "i18n：slash 指令說明透過補全備援路徑在地化。"],
	["ja", "i18n: スラッシュコマンドの説明は補完の代替経路で翻訳されます。"],
	["ko", "i18n: 슬래시 명령 설명은 자동 완성 대체 경로로 번역됩니다."],
	["de", "i18n: Slash-Befehlsbeschreibungen werden über die Autovervollständigung als Ausweichlösung übersetzt."],
	["fr", "i18n : les descriptions des commandes slash sont traduites via la saisie semi-automatique de secours."],
	["es", "i18n: las descripciones de los comandos slash se traducen mediante la ruta alternativa de autocompletado."],
	["pt-BR", "i18n: as descrições dos comandos slash são traduzidas pela rota alternativa de preenchimento automático."],
] as const;

describe("fallback mode notice", () => {
	it.each(notices)("uses the active %s bundle on session start", async (locale, expected) => {
		vi.resetModules();
		settings.locale = locale;
		const { default: extension } = await import("../index.ts");
		const handlers = new Map<string, (...args: any[]) => any>();
		const messages: string[] = [];
		const pi = {
			events: { on() {}, emit() {} }, on: (name: string, handler: any) => handlers.set(name, handler),
			registerTool() {}, registerCommand() {}, getCommands: () => [],
		};
		extension(pi as any);
		await handlers.get("session_start")?.({}, {
			cwd: process.cwd(), ui: { notify: (message: string) => messages.push(message), setHeader() {} },
		});
		expect(messages).toContain(expected);
	});
});
