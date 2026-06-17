// 思考语言本地化（B 线）核心逻辑测试。
// 覆盖纯函数：baseline 查询、cache 失效比对、三层查询顺序、describe 收集。
// translator/localize 涉 LLM + pi runtime，留待切片 4。

import { describe, it, expect } from "vitest";
import { getBaselineTranslation, hasBaseline } from "../src/think/baseline.js";
import { getCachedEntry, putCachedEntry, isEnabled, setEnabled } from "../src/think/cache.js";
import { collectDescriptions, extractParamDescriptions } from "../src/think/describe.js";
import type { ThinkCache } from "../src/think/types.js";

function emptyCache(): ThinkCache {
	return { enabled: false, locales: {} };
}

describe("baseline 预制翻译查询", () => {
	it("zh-CN 命中 baseline 的 tool description", () => {
		const v = getBaselineTranslation("zh-CN", "tool", "read");
		expect(v).toBeTruthy();
		expect(v).not.toContain("Read the contents");
	});

	it("英文 locale 不在 baseline（baseline 只覆盖非 en 语言）", () => {
		expect(getBaselineTranslation("en", "tool", "read")).toBeUndefined();
	});

	it("param key 形如 'edit:edits' 也能命中", () => {
		const v = getBaselineTranslation("ja", "param", "edit:edits");
		expect(v).toBeTruthy();
	});

	it("未知 locale 无 baseline", () => {
		expect(getBaselineTranslation("xx-XX", "tool", "read")).toBeUndefined();
	});

	it("hasBaseline 反映 12 语言覆盖", () => {
		for (const l of ["zh-CN", "zh-TW", "ja", "ko", "ru", "vi", "es", "pt-BR", "de", "fr", "id", "hi"]) {
			expect(hasBaseline(l)).toBe(true);
		}
		expect(hasBaseline("en")).toBe(false);
	});
});

describe("cache 失效比对（ADR 决策 11）", () => {
	it("en 原文一致时命中缓存", () => {
		const cache = emptyCache();
		putCachedEntry(cache, "zh-CN", "tool", "read", "English original", "中文翻译");
		const got = getCachedEntry(cache, "zh-CN", "tool", "read", "English original");
		expect(got?.translated).toBe("中文翻译");
	});

	it("en 原文改变后视为过期（undefined）", () => {
		const cache = emptyCache();
		putCachedEntry(cache, "zh-CN", "tool", "read", "old en", "旧翻译");
		const got = getCachedEntry(cache, "zh-CN", "tool", "read", "new en after pi upgrade");
		expect(got).toBeUndefined();
	});

	it("未缓存的 locale 返回 undefined", () => {
		const cache = emptyCache();
		expect(getCachedEntry(cache, "zh-CN", "tool", "read", "any")).toBeUndefined();
	});

	it("enabled 开关读写", () => {
		const cache = emptyCache();
		expect(isEnabled(cache)).toBe(false);
		setEnabled(cache, true);
		expect(isEnabled(cache)).toBe(true);
		setEnabled(cache, false);
		expect(isEnabled(cache)).toBe(false);
	});
});

describe("describe 收集", () => {
	it("从 ToolInfo 数组收集 tool + param description", () => {
		const tools = [
			{
				name: "read",
				description: "Read a file",
				parameters: {
					properties: {
						path: { type: "string", description: "file path" },
						offset: { type: "number", description: "line number" },
					},
				},
			},
		];
		const items = collectDescriptions(tools);
		const types = items.map((i) => i.type).sort();
		expect(types).toContain("tool");
		expect(types).toContain("param");
		const readTool = items.find((i) => i.type === "tool" && i.key === "read");
		expect(readTool?.en).toBe("Read a file");
		const paramPath = items.find((i) => i.type === "param" && i.key === "read:path");
		expect(paramPath?.en).toBe("file path");
	});

	it("嵌套 object 参数的子字段也被提取", () => {
		const params = {
			properties: {
				nested: {
					type: "object",
					description: "parent",
					properties: { child: { description: "child desc" } },
				},
			},
		};
		const items = extractParamDescriptions(params, "edit");
		expect(items.map((i) => i.key)).toContain("edit:nested");
		expect(items.map((i) => i.key)).toContain("edit:nested.child");
	});

	it("无 description 的工具/参数被跳过", () => {
		const tools = [{ name: "x", parameters: { properties: { p: { type: "string" } } } }];
		expect(collectDescriptions(tools)).toEqual([]);
	});
});
