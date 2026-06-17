// 端到端通路测试：验证 before_provider_request 真实把英文 description
// 替换成目标语言的 baseline 翻译（LLM 实际会读到的 payload）。
//
// 覆盖路线图切片 1 的明文验证标准：
//   "/lang think on → 发消息 → 确认 LLM 收到的 description 是目标语言"
// 用 baseline 命中的工具（read/bash 等），pending 为空不触发 LLM 调用，
// 纯替换路径确定性可测。

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { applyOnProviderRequest, commandThink, prefetchOnSessionStart, runThinkDoctor } from "../src/think/localize.js";
import { loadCache as loadThinkCache } from "../src/think/cache.js";
import type { I18nApi } from "../src/types.js";

// 最小 i18n：返回固定 locale
function makeI18n(locale: string): I18nApi {
	return {
		getLocale: () => locale,
		setLocale: () => {},
		getFallbackLocale: () => "en",
		setFallbackLocale: () => {},
		registerBundle: () => ({ ok: true, errors: [] }),
		t: (k: string) => k,
		onLocaleChanged: () => () => {},
		doctor: () => ({ issues: [] }),
		listNamespaces: () => [],
	} as unknown as I18nApi;
}

// 构造 pi 自带 read 工具的 provider payload（英文 description，与 baseline 源一致）
const READ_DESCRIPTION =
	"Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.";
const PATH_DESCRIPTION = "Path to the file to read (relative or absolute)";
const OFFSET_DESCRIPTION = "Line number to start reading from (1-indexed)";

function makePayload() {
	return {
		tools: [
			{
				type: "function",
				function: {
					name: "read",
					description: READ_DESCRIPTION,
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: PATH_DESCRIPTION },
							offset: { type: "number", description: OFFSET_DESCRIPTION },
						},
					},
				},
			},
		],
	};
}

function makeAnthropicPayload() {
	return {
		tools: [
			{
				name: "read",
				description: READ_DESCRIPTION,
				input_schema: {
					type: "object",
					properties: {
						path: { type: "string", description: PATH_DESCRIPTION },
						offset: { type: "number", description: OFFSET_DESCRIPTION },
					},
				},
			},
		],
	};
}

function makeGooglePayload() {
	return {
		tools: [
			{
				functionDeclarations: [
					{
						name: "read",
						description: READ_DESCRIPTION,
						parametersJsonSchema: {
							type: "object",
							properties: {
								path: { type: "string", description: PATH_DESCRIPTION },
								offset: { type: "number", description: OFFSET_DESCRIPTION },
							},
						},
					},
				],
			},
		],
	};
}

describe("before_provider_request 端到端替换（LLM 实际收到的 payload）", () => {
	it("think 开启 + zh-CN：read 工具描述被替换为中文 baseline", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		// 通过 commandThink 开启
		let notified = "";
		await commandThink("on", { ui: { notify: (m: string) => (notified = m) } }, i18n, cache);
		expect(notified).toContain("已开启");
		expect(cache.enabled).toBe(true);

		const event = { type: "before_provider_request", payload: makePayload() };
		// ctx 不需要 model（baseline 命中，pending 为空，不调 LLM）
		const result = await applyOnProviderRequest(event, { model: undefined }, i18n, cache);

		const desc = result.tools[0].function.description;
		expect(desc).not.toContain("Read the contents of a file");
		expect(desc).toContain("读取"); // baseline zh-CN 的 read 翻译含"读取"

		// param description 也被替换
		const pathDesc = result.tools[0].function.parameters.properties.path.description;
		expect(pathDesc).not.toContain("Path to the file");
		expect(pathDesc).toContain("路径");
	});

	it("Anthropic payload：input_schema.properties 的 param description 也被替换", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		await commandThink("on", { ui: { notify: () => {} } }, i18n, cache);

		const event = { type: "before_provider_request", payload: makeAnthropicPayload() };
		const result = await applyOnProviderRequest(event, { model: undefined }, i18n, cache);

		expect(result.tools[0].description).toContain("读取");
		expect(result.tools[0].input_schema.properties.path.description).toContain("路径");
		expect(result.tools[0].input_schema.properties.path.type).toBe("string"); // 不碰 type
	});

	it("Google payload：functionDeclarations + parametersJsonSchema 被替换", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		await commandThink("on", { ui: { notify: () => {} } }, i18n, cache);

		const event = { type: "before_provider_request", payload: makeGooglePayload() };
		const result = await applyOnProviderRequest(event, { model: undefined }, i18n, cache);
		const fn = result.tools[0].functionDeclarations[0];

		expect(fn.description).toContain("读取");
		expect(fn.parametersJsonSchema.properties.path.description).toContain("路径");
		expect(fn.name).toBe("read"); // 不碰工具名
	});

	it("think 开启 + ja：read 描述被替换为日语 baseline", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("ja");
		await commandThink("on", { ui: { notify: () => {} } }, i18n, cache);

		const event = { type: "before_provider_request", payload: makePayload() };
		const result = await applyOnProviderRequest(event, { model: undefined }, i18n, cache);

		expect(result.tools[0].function.description).toContain("ファイル");
	});

	it("think 关闭：description 保持英文不被替换", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		await commandThink("off", { ui: { notify: () => {} } }, i18n, cache);
		expect(cache.enabled).toBe(false);

		const original = makePayload();
		const event = { type: "before_provider_request", payload: original };
		const result = await applyOnProviderRequest(event, {}, i18n, cache);

		expect(result).toBeUndefined(); // 关闭时直接返回 undefined，不改 payload
		expect(original.tools[0].function.description).toContain("Read the contents");
	});

	it("locale=en：不替换（英文无需翻译）", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("en");
		await commandThink("on", { ui: { notify: () => {} } }, i18n, cache);

		const event = { type: "before_provider_request", payload: makePayload() };
		const result = await applyOnProviderRequest(event, {}, i18n, cache);
		expect(result).toBeUndefined();
	});

	it("非 baseline 工具（第三方扩展）：英文保留，pending 留给兜底（无 ctx.model 时不崩）", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		await commandThink("on", { ui: { notify: () => {} } }, i18n, cache);

		const payload = {
			tools: [
				{
					type: "function",
					function: {
						name: "my_custom_tool",
						description: "A custom third-party tool that is not in baseline",
						parameters: { type: "object", properties: {} },
					},
				},
			],
		};
		const event = { type: "before_provider_request", payload };
		// 无 ctx.model → translateAndCache 里 translateBatch 拿不到 model 返回空 Map
		// → 该条保留英文，不崩
		const result = await applyOnProviderRequest(event, { model: undefined }, i18n, cache);
		expect(result.tools[0].function.description).toContain("A custom third-party tool");
	});
});

describe("session_start 预翻译 prefetchOnSessionStart（修复后传真实 ctx）", () => {
	it("baseline 全覆盖时：不抛 TypeError、不调 LLM、同步返回", () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		cache.enabled = true;

		const pi = {
			getAllTools: () => [
				{ name: "read", description: "Read the contents of a file.", parameters: { properties: { path: { description: "Path to the file" } } } },
				{ name: "bash", description: "Execute a bash command.", parameters: { properties: { command: { description: "Bash command" } } } },
			],
		};
		let llmCalled = false;
		const ctx = { model: { id: "fake", provider: "fake", maxTokens: 0 }, modelRegistry: { getApiKeyAndHeaders: async () => { llmCalled = true; return { ok: false }; } } };

		// 关键断言：不抛 TypeError（修复前 ctx=undefined 会在 translateBatch→translateChunk 的 ctx.model 抛错被静默吞掉）
		expect(() => prefetchOnSessionStart(pi as any, ctx, i18n, cache)).not.toThrow();
		expect(llmCalled).toBe(false); // baseline 全覆盖，pending=0，不调 LLM
	});

	it("think 关闭时：直接返回，不扫工具", () => {
		const cache = loadThinkCache();
		cache.enabled = false;
		let toolsCalled = false;
		const pi = { getAllTools: () => { toolsCalled = true; return []; } };
		prefetchOnSessionStart(pi as any, {}, makeI18n("zh-CN"), cache);
		expect(toolsCalled).toBe(false);
	});
});

// 切片 3：doctor 诊断 + clear 缓存清理。测试备份/恢复真实 think.json 避免污染。
const THINK_PATH = path.join(os.homedir(), ".pi", "agent", "state", "pi-di18n", "think.json");
let backup: string | null = null;

beforeAll(() => {
	try { backup = fs.readFileSync(THINK_PATH, "utf-8"); } catch { backup = null; }
});
afterAll(() => {
	try {
		if (backup !== null) fs.writeFileSync(THINK_PATH, backup, "utf-8");
		else if (fs.existsSync(THINK_PATH)) fs.writeFileSync(THINK_PATH, '{"enabled":false,"locales":{}}', "utf-8");
	} catch {}
});

describe("/lang think doctor + clear（切片 3）", () => {
	it("doctor 报告 baseline 覆盖数、缓存数、过期数", async () => {
		const cache = loadThinkCache();
		cache.enabled = true;
		const i18n = makeI18n("zh-CN");
		let msg = "";
		// 有 getAllTools 的 ctx
		const ctx = {
			ui: { notify: (m: string) => (msg = m) },
			getAllTools: () => [
				{ name: "read", description: "Read the contents of a file.", parameters: { properties: { path: { description: "Path to the file" } } } },
			],
		};
		await runThinkDoctor(ctx, i18n, cache);
		expect(msg).toContain("think.doctor");
		expect(msg).toContain("locale=zh-CN");
		expect(msg).toContain("baseline 覆盖"); // zh-CN 有 baseline
	});

	it("doctor 检测过期：缓存 en 与 session en 不一致时报 warning", async () => {
		const cache = loadThinkCache();
		cache.enabled = true;
		cache.locales["zh-CN"] = { tool: { read: { en: "OLD en description", translated: "旧翻译" } }, param: {} };
		const i18n = makeI18n("zh-CN");
		let msg = "";
		let level = "";
		const ctx = {
			ui: { notify: (m: string, l: string) => { msg = m; level = l; } },
			getAllTools: () => [{ name: "read", description: "NEW en after upgrade", parameters: { properties: {} } }],
		};
		await runThinkDoctor(ctx, i18n, cache);
		expect(msg).toContain("过期(待重翻): 1");
		expect(level).toBe("warning");
	});

	it("doctor 报告 pending：非 baseline 且无有效缓存的条目计入待翻译", async () => {
		const cache = loadThinkCache();
		cache.locales["zh-CN"] = { tool: {}, param: {} };
		let msg = "";
		const ctx = {
			ui: { notify: (m: string) => (msg = m) },
			getAllTools: () => [{ name: "custom_tool", description: "Custom description", parameters: { properties: {} } }],
		};
		await runThinkDoctor(ctx, makeI18n("zh-CN"), cache);
		expect(msg).toContain("pending(待翻译): 1");
	});

	it("clear 清除当前 locale 缓存", async () => {
		const cache = loadThinkCache();
		cache.locales["zh-CN"] = { tool: { read: { en: "en", translated: "中" } }, param: { "read:path": { en: "en", translated: "中" } } };
		const i18n = makeI18n("zh-CN");
		let msg = "";
		await commandThink("clear", { ui: { notify: (m: string) => (msg = m) } }, i18n, cache);
		expect(msg).toContain("已清除 locale=zh-CN");
		expect(msg).toContain("2 条");
		expect(cache.locales["zh-CN"]).toBeUndefined();
	});

	it("clear-all 清除全部 locale 缓存", async () => {
		const cache = loadThinkCache();
		cache.locales["zh-CN"] = { tool: { read: { en: "e", translated: "t" } }, param: {} };
		cache.locales["ja"] = { tool: { read: { en: "e", translated: "t" } }, param: {} };
		let msg = "";
		await commandThink("clear-all", { ui: { notify: (m: string) => (msg = m) } }, makeI18n("zh-CN"), cache);
		expect(msg).toContain("全部 locale");
		expect(Object.keys(cache.locales).length).toBe(0);
	});

	it("doctor 无 getAllTools 时不崩，报 N/A", async () => {
		const cache = loadThinkCache();
		const i18n = makeI18n("zh-CN");
		let msg = "";
		await runThinkDoctor({ ui: { notify: (m: string) => (msg = m) } }, i18n, cache);
		expect(msg).toContain("think.doctor");
		expect(msg).toContain("baseline 覆盖");
	});
});
