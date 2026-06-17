import { describe, expect, it } from "vitest";
import { getCachedCommandDescription, putCachedCommandDescription, type UiCache } from "../src/ui-localize/cache.js";
import { resolveRuntimeCommandDescription } from "../src/ui-localize/localize.js";

describe("A-line runtime UI description localization", () => {
	it("resolves cached command descriptions and invalidates on English source change", () => {
		const cache: UiCache = { locales: {} };
		putCachedCommandDescription(cache, "zh-CN", "command:skill:demo", "Demo command", "演示命令");

		expect(getCachedCommandDescription("zh-CN", "command:skill:demo", "Demo command", cache)).toBe("演示命令");
		expect(getCachedCommandDescription("zh-CN", "command:skill:demo", "Changed command", cache)).toBeUndefined();
	});

	it("resolveRuntimeCommandDescription follows current locale and keeps English locale unchanged", () => {
		const cache: UiCache = {
			locales: {
				"zh-CN": { command: { "command:skill:demo": { en: "Demo command", translated: "演示命令" } } },
			},
		};

		expect(resolveRuntimeCommandDescription("zh-CN", "skill:demo", "Demo command", cache)).toBe("演示命令");
		expect(resolveRuntimeCommandDescription("en", "skill:demo", "Demo command", cache)).toBeUndefined();
	});
});
