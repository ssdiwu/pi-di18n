import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getCachedCommandDescription, putCachedCommandDescription, type UiCache } from "../src/ui-localize/cache.js";
import { resolveRuntimeCommandDescription } from "../src/ui-localize/localize.js";

// putCachedCommandDescription 会自动落盘，先指向隔离目录，避免污染真实 ~/.pi。
const TEST_STATE_DIR = path.join(os.tmpdir(), `pi-di18n-ui-localize-${process.pid}`);

beforeAll(() => {
	process.env.PI_DI18N_STATE_DIR = TEST_STATE_DIR;
	fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
});

afterAll(() => {
	fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
	delete process.env.PI_DI18N_STATE_DIR;
});

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
