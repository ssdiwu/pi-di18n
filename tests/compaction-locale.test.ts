import { describe, expect, it } from "vitest";
import { languageForLocale, languageInstructionForLocale } from "../src/compaction/locale.ts";

describe("compaction locale mapping", () => {
	it("maps supported locales to summary languages", () => {
		expect(languageForLocale("zh-CN")).toBe("zh-Hans");
		expect(languageForLocale("zh-TW")).toBe("zh-Hant");
		expect(languageForLocale("ja-JP")).toBe("ja");
		expect(languageForLocale("ko-KR")).toBe("ko");
		expect(languageForLocale("en-US")).toBe("en");
	});

	it("creates explicit language instructions", () => {
		expect(languageInstructionForLocale("zh-CN")).toContain("简体中文");
		expect(languageInstructionForLocale("zh-TW")).toContain("繁體中文");
		expect(languageInstructionForLocale("ja-JP")).toContain("日本語");
	});
});
