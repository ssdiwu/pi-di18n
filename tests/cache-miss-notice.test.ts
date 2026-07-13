import { describe, expect, it } from "vitest";
import { formatCacheMissNotice, parseCacheMissNotice } from "../src/cache-miss-notice.ts";

describe("cache miss notice templates", () => {
	it("parses generic notices and preserves token/cost values", () => {
		expect(parseCacheMissNotice("Cache miss: 25k tokens re-billed (~$0.32)")).toEqual({
			kind: "generic",
			tokens: "25k",
			minutes: undefined,
			cost: "0.32",
		});
	});

	it("parses model-switch and idle branches", () => {
		expect(parseCacheMissNotice("Cache miss after model switch: 1.2M tokens re-billed")).toMatchObject({
			kind: "model-switch",
			tokens: "1.2M",
		});
		expect(parseCacheMissNotice("Cache miss after 7m idle: 42k tokens re-billed (~$1.10)")).toEqual({
			kind: "idle",
			tokens: "42k",
			minutes: 7,
			cost: "1.10",
		});
	});

	it("parses ANSI-colored upstream text without treating escape codes as content", () => {
		const input = "\u001b[38;2;255;180;0mCache miss after 7m idle: 42k tokens re-billed (~$1.10)\u001b[39m";
		expect(parseCacheMissNotice(input)).toMatchObject({ kind: "idle", minutes: 7, tokens: "42k", cost: "1.10" });
	});

	it("uses exact zh-CN and zh-TW templates for idle and model-switch branches", () => {
		expect(formatCacheMissNotice("zh-CN", { kind: "idle", minutes: 7, tokens: "42k", cost: "1.10" })).toBe(
			"空闲 7 分钟后缓存未命中：42k Token 重新计费（约 $1.10）",
		);
		expect(formatCacheMissNotice("zh-CN", { kind: "model-switch", tokens: "25k", cost: "0.32" })).toBe(
			"切换模型后缓存未命中：25k Token 重新计费（约 $0.32）",
		);
		expect(formatCacheMissNotice("zh-TW", { kind: "idle", minutes: 7, tokens: "42k", cost: "1.10" })).toBe(
			"閒置 7 分鐘後快取未命中：42k Token 重新計費（約 $1.10）",
		);
		expect(formatCacheMissNotice("zh-TW", { kind: "model-switch", tokens: "25k", cost: "0.32" })).toBe(
			"切換模型後快取未命中：25k Token 重新計費（約 $0.32）",
		);
	});

	it("formats every supported locale while retaining minutes, tokens, and cost", () => {
		const notice = { kind: "idle" as const, minutes: 7, tokens: "42k", cost: "1.10" };
		for (const locale of ["zh-CN", "zh-TW", "ja", "ko", "de", "fr", "es", "pt-BR"]) {
			const output = formatCacheMissNotice(locale, notice);
			expect(output).toContain("42k");
			expect(output).toContain("1.10");
			expect(output).toContain("7");
			expect(output).not.toContain("Cache miss");
		}
	});

	it("falls back to the English template for unknown locales", () => {
		expect(formatCacheMissNotice("xx", { kind: "generic", tokens: "25k" })).toBe("Cache miss: 25k tokens re-billed");
	});

	it("returns null for unrelated dynamic text", () => {
		expect(parseCacheMissNotice("Cache miss: not a standard notice")).toBeNull();
	});
});
