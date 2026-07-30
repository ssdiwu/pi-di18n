// LLM 运行时翻译：把英文 description 批量翻成目标 locale 语言。
//
// 复用 pi-compaction-i18n 已验证的 complete() + resolveModelAuth 模式：
//   - 用 session 当前模型（ADR 0001，不做多模型配置）
//   - resolveModelAuth 多策略鉴权（modelRegistry → auth.json → env）
//
// resolveModelAuth 与 compaction/summarize.ts 同源，当前两处使用；
// 第三次出现时抽到 src/shared/model-auth.ts。
//
// 第一版用 JSON 文本输出 + 容错解析（失败回退英文）；未来可升级 tool calling。

import { complete, getEnvApiKey } from "@earendil-works/pi-ai/compat";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type TranslationInput = { key: string; en: string };

// locale → 语言英文名（LLM 普遍理解），用于翻译 prompt。
const LOCALE_LANGUAGE: Record<string, string> = {
	"zh-CN": "Simplified Chinese",
	"zh-TW": "Traditional Chinese",
	ja: "Japanese",
	ko: "Korean",
	ru: "Russian",
	vi: "Vietnamese",
	es: "Spanish",
	"pt-BR": "Brazilian Portuguese",
	de: "German",
	fr: "French",
	id: "Indonesian",
	hi: "Hindi",
};

function languageForLocale(locale: string): string {
	return LOCALE_LANGUAGE[locale] ?? locale;
}

type ResolvedModelAuth = {
	resolved: boolean;
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
};

async function resolveModelAuth(ctx: any, model: any): Promise<ResolvedModelAuth> {
	// Pi 0.82+ providers may resolve authentication entirely to headers/env.
	try {
		const auth = await ctx.modelRegistry?.getApiKeyAndHeaders(model);
		if (auth?.ok) {
			return {
				resolved: true,
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
			};
		}
	} catch {
		// Continue with compatibility fallbacks.
	}
	try {
		const authPath = join(homedir(), ".pi", "agent", "auth.json");
		if (existsSync(authPath)) {
			const authData = JSON.parse(readFileSync(authPath, "utf-8"));
			const cred = authData[model.provider];
			if (cred?.type === "api_key" && cred?.key) return { resolved: true, apiKey: cred.key };
		}
	} catch {
		// Continue with environment fallback.
	}
	try {
		const envKey = getEnvApiKey(model.provider);
		if (envKey) return { resolved: true, apiKey: envKey };
	} catch {
		// No compatible authentication source was found.
	}
	return { resolved: false };
}

const SYSTEM_PROMPT =
	"You are a precise translator for developer tool descriptions. Translate each description to the target language. Rules: keep technical terms (API, CLI, bash, glob, regex, .gitignore, parameter names, code identifiers, numbers, units like KB/ms/bytes) in English; preserve the exact meaning, tone, and approximate length; do not translate tool names or parameter names. Output ONLY a JSON object mapping each input key to its translation — no markdown, no code fences, no commentary.";

/** 按 en 字符数分批，避免单次输出过长。 */
function chunkItems(items: TranslationInput[], maxCharsPerBatch = 6000): TranslationInput[][] {
	const chunks: DescribeItem[][] = [];
	let cur: TranslationInput[] = [];
	let curLen = 0;
	for (const it of items) {
		if (curLen + it.en.length > maxCharsPerBatch && cur.length > 0) {
			chunks.push(cur);
			cur = [];
			curLen = 0;
		}
		cur.push(it);
		curLen += it.en.length;
	}
	if (cur.length > 0) chunks.push(cur);
	return chunks;
}

/** 解析 LLM 返回的 JSON，容错（去 markdown fence / 取首个 JSON 对象）。 */
function parseTranslationMap(raw: string): Record<string, string> {
	let s = raw.trim();
	// 去除可能的 markdown 代码块包裹
	s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
	// 取首个 { 到末尾 } 之间的内容
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return {};
	try {
		const obj = JSON.parse(s.slice(start, end + 1));
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(obj)) {
			if (typeof v === "string" && v.trim()) out[k] = v;
		}
		return out;
	} catch {
		return {};
	}
}

async function translateChunk(
	ctx: any,
	chunk: TranslationInput[],
	targetLang: string,
	signal?: AbortSignal,
): Promise<Record<string, string>> {
	const model = ctx.model;
	if (!model) return {};

	const auth = await resolveModelAuth(ctx, model);
	if (!auth.resolved) return {};

	const input = chunk.map((it) => ({ key: it.key, en: it.en }));
	const userPrompt = `Target language: ${targetLang}\n\nTranslate each of the following. Output a JSON object {key: translation}.\n\n${JSON.stringify(input, null, 2)}`;

	try {
		const response = await complete(
			model,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [{ role: "user", content: [{ type: "text", text: userPrompt }], timestamp: Date.now() }],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				signal,
				maxTokens: Math.min(8192, model.maxTokens > 0 ? model.maxTokens : 8192),
			},
		);
		const text = response.content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n")
			.trim();
		return parseTranslationMap(text);
	} catch {
		return {};
	}
}

/**
 * 批量翻译多条 description。
 * 失败的条目不会出现在结果 Map 中（调用方对这些回退英文）。
 */
export async function translateBatch(
	ctx: any,
	items: TranslationInput[],
	locale: string,
	signal?: AbortSignal,
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (items.length === 0) return result;
	const targetLang = languageForLocale(locale);
	for (const chunk of chunkItems(items)) {
		const translated = await translateChunk(ctx, chunk, targetLang, signal);
		for (const [k, v] of Object.entries(translated)) {
			result.set(k, v);
		}
	}
	return result;
}
