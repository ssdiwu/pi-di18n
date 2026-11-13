import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.PI_DI18N_STATE_DIR = "/dev/null"; });
import { tSlashDescForTest } from "../src/core-hacks.ts";
import { getActiveUiCache, setActiveUiCache } from "../src/ui-localize/cache.ts";

const originalCache = getActiveUiCache();
const description = "Continue a side conversation";
const translated = "继续支线对话";
const i18n = { getLocale: () => "zh-CN", t: (key: string) => key };

afterEach(() => setActiveUiCache(originalCache));

describe("tagged autocomplete command descriptions", () => {
	it.each([
		"[u] ",
		"[p] ",
		"[t] ",
		"[u:npm:pi-btw] ",
		"[p:npm:@scope/pi-tool2] ",
		"[u:git:github.com/owner/pi-tool2@v1.2.0] ",
		"",
	])("matches the bare cache source and preserves tag %s", (tag) => {
		setActiveUiCache({ locales: { "zh-CN": { command: { "command:btw": { en: description, translated } } } } });
		expect(tSlashDescForTest(i18n as any, { name: "btw", description: `${tag}${description}` })).toBe(`${tag}${translated}`);
	});

	it("retains source invalidation, uncached text, and semantic bracket prefixes", () => {
		setActiveUiCache({ locales: { "zh-CN": { command: { "command:btw": { en: description, translated } } } } });
		for (const text of [`[u] ${description} changed`, `[warning] ${description}`, "[u] Unknown command"]) {
			expect(tSlashDescForTest(i18n as any, { name: "btw", description: text })).toBe(text);
		}
	});

	it("keeps the English locale unchanged", () => {
		setActiveUiCache({ locales: { en: { command: { "command:btw": { en: description, translated } } } } });
		const text = `[u:npm:pi-btw] ${description}`;
		expect(tSlashDescForTest({ ...i18n, getLocale: () => "en" } as any, { name: "btw", description: text })).toBe(text);
	});
});
