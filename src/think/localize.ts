// 思考语言本地化的核心编排：三层翻译源查询 + 钩子接入 + /lang think 命令。
//
// 数据流见 doc/30-路线图/路线图.md「B 线总览」。三层翻译源（ADR 决策 3）：
//   ① 预制 baseline（baseline.ts）→ ② 翻译缓存（cache.ts）→ ③ 同步 LLM 翻译兜底（translator.ts）
//
// 触发点（ADR 决策 6）：
//   - session_start：异步预翻译（不阻塞 session）
//   - before_provider_request：替换 payload.tools 的 description；缓存 miss 时同步兜底

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { I18nApi } from "../types.js";
import type { ThinkCache, ThinkType, DescribeItem } from "./types.js";
import { getBaselineTranslation, countBaseline } from "./baseline.js";
import { getCachedEntry, isEnabled, putCachedEntry, setEnabled, clearLocale } from "./cache.js";
import { collectDescriptions, extractParamDescriptions } from "./describe.js";
import { translateBatch } from "./translator.js";

// 防止后台预翻译和同步兜底重复触发。key 形如 "zh-CN:tool:read"。
const inFlight = new Map<string, Promise<string | undefined>>();

function flightKey(locale: string, it: Pick<DescribeItem, "type" | "key">): string {
	return `${locale}:${it.type}:${it.key}`;
}

function localeNeedsTranslate(locale: string): boolean {
	const l = String(locale || "").toLowerCase();
	return l !== "" && l !== "en";
}

/** 三层查询：返回某条 description 的翻译；undefined 表示需要 LLM 翻译。 */
function resolveFromSource(cache: ThinkCache, locale: string, type: ThinkType, key: string, en: string): string | undefined {
	// ① 预制 baseline
	const baseline = getBaselineTranslation(locale, type, key);
	if (baseline) return baseline;
	// ② 翻译缓存（含 en 原文失效比对）
	const cached = getCachedEntry(cache, locale, type, key, en);
	if (cached) return cached.translated;
	return undefined;
}

/**
 * 翻译一批 pending 条目，写入缓存，返回 key→翻译 的 Map。
 * 若同一 key 正在由 session_start 预翻译，则同步兜底会等待已有 promise，避免重复 LLM 调用。
 */
async function translateAndCache(ctx: any, items: DescribeItem[], locale: string, cache: ThinkCache): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (items.length === 0) return out;

	const fresh: DescribeItem[] = [];
	const waits: Array<Promise<void>> = [];
	for (const it of items) {
		const ifk = flightKey(locale, it);
		const existing = inFlight.get(ifk);
		if (existing) {
			waits.push(existing.then((v) => { if (v) out.set(it.key, v); }));
		} else {
			fresh.push(it);
		}
	}

	if (fresh.length > 0) {
		const batch = translateBatch(ctx, fresh, locale).catch(() => new Map<string, string>());
		for (const it of fresh) {
			const ifk = flightKey(locale, it);
			const promise = batch
				.then((translated) => {
					const v = translated.get(it.key);
					if (v) putCachedEntry(cache, locale, it.type, it.key, it.en, v);
					return v;
				})
				.finally(() => inFlight.delete(ifk));
			inFlight.set(ifk, promise);
			waits.push(promise.then((v) => { if (v) out.set(it.key, v); }));
		}
	}

	await Promise.all(waits);
	return out;
}

/**
 * session_start 预翻译（异步，不阻塞）。
 * 扫描当前 session 全部工具，把 baseline 和缓存都没有的条目用 session 模型翻译落盘。
 *
 * 需要 ctx（拿 ctx.model / ctx.modelRegistry 做 LLM 调用）和 pi（拿 pi.getAllTools()）。
 */
export function prefetchOnSessionStart(pi: ExtensionAPI, ctx: any, i18n: I18nApi, cache: ThinkCache): void {
	if (!isEnabled(cache)) return;
	const locale = i18n.getLocale();
	if (!localeNeedsTranslate(locale)) return;

	let tools: any[];
	try {
		tools = pi.getAllTools();
	} catch {
		return;
	}
	const all = collectDescriptions(tools);
	// 过滤：baseline 无 且 缓存无/过期，且不在 in-flight
	const pending: DescribeItem[] = [];
	for (const it of all) {
		if (inFlight.has(flightKey(locale, it))) continue;
		if (resolveFromSource(cache, locale, it.type, it.key, it.en)) continue;
		pending.push(it);
	}
	if (pending.length === 0) return;

	// 异步执行，不 await（session_start 不阻塞）。fire-and-forget。用真实 ctx 拿 model。
	void translateAndCache(ctx, pending, locale, cache).catch(() => {
		// 预翻译失败不影响主流程（before_provider_request 会兜底）
	});
}

type ProviderToolSlot = {
	name: string;
	descriptionOwner: any;
	paramSchemas: any[];
};

function providerToolSlots(tools: any[]): ProviderToolSlot[] {
	const out: ProviderToolSlot[] = [];
	for (const t of tools) {
		// Google/Gemini: tools[0].functionDeclarations[].parametersJsonSchema
		if (Array.isArray(t?.functionDeclarations)) {
			for (const fn of t.functionDeclarations) {
				if (!fn?.name) continue;
				out.push({
					name: fn.name,
					descriptionOwner: fn,
					paramSchemas: [fn.parametersJsonSchema, fn.parameters].filter(Boolean),
				});
			}
			continue;
		}

		// OpenAI: { type:"function", function:{ name, description, parameters } }
		// Anthropic: { name, description, input_schema }
		const fn = t?.function ?? t;
		const name = fn?.name ?? t?.name;
		if (!name) continue;
		out.push({
			name,
			descriptionOwner: fn,
			paramSchemas: [fn?.parameters, fn?.input_schema, fn?.parametersJsonSchema].filter(Boolean),
		});
	}
	return out;
}

/**
 * before_provider_request：替换 payload.tools 的 description 为目标语言。
 * 缓存 miss 的条目同步兜底翻译（ADR 决策 6，保证 LLM 一定读到目标语言）。
 */
export async function applyOnProviderRequest(event: any, ctx: any, i18n: I18nApi, cache: ThinkCache): Promise<any> {
	if (!isEnabled(cache)) return undefined;
	const locale = i18n.getLocale();
	if (!localeNeedsTranslate(locale)) return undefined;

	const payload = event?.payload;
	if (!payload || typeof payload !== "object") return undefined;
	const tools = (payload as any).tools;
	if (!Array.isArray(tools) || tools.length === 0) return undefined;

	// 第一遍：收集每个 tool/param 的待翻译条目（三层查询 miss 的）
	const pending: DescribeItem[] = [];
	// 记录每个 tool 的结构位置，便于第二遍回填
	const slots: Array<{ setType: (v: string) => void; type: ThinkType; key: string; en: string }> = [];

	for (const slot of providerToolSlots(tools)) {
		const { name, descriptionOwner, paramSchemas } = slot;

		// tool description
		if (typeof descriptionOwner.description === "string" && descriptionOwner.description) {
			const hit = resolveFromSource(cache, locale, "tool", name, descriptionOwner.description);
			if (hit) {
				descriptionOwner.description = hit;
			} else {
				const en = descriptionOwner.description;
				pending.push({ type: "tool", key: name, en });
				slots.push({ setType: (v) => (descriptionOwner.description = v), type: "tool", key: name, en });
			}
		}

		// param descriptions (OpenAI parameters, Anthropic input_schema, Google parametersJsonSchema)
		for (const schema of paramSchemas) {
			const props = schema?.properties;
			if (!props || typeof props !== "object") continue;
			for (const [pn, psRaw] of Object.entries(props)) {
				const ps = psRaw as any;
				if (typeof ps?.description !== "string" || !ps.description) continue;
				const key = `${name}:${pn}`;
				const hit = resolveFromSource(cache, locale, "param", key, ps.description);
				if (hit) {
					ps.description = hit;
				} else {
					const en = ps.description;
					pending.push({ type: "param", key, en });
					slots.push({ setType: (v) => (ps.description = v), type: "param", key, en });
				}
			}
		}
	}

	// 第二遍：同步兜底翻译 pending（用 ctx，含 model）
	if (pending.length > 0) {
		const translated = await translateAndCache(ctx, pending, locale, cache);
		for (const s of slots) {
			const v = translated.get(s.key);
			if (v) s.setType(v);
		}
	}

	return payload;
}

/**
 * /lang think 命令处理。
 * 用法：on（=auto，跟随当前 locale）/ off / 无参查状态。
 * 语言由 /lang 的 locale 决定，think 不持有第二个 locale 真相源（ADR 决策 12）。
 */
export async function commandThink(args: string, ctx: any, i18n: I18nApi, cache: ThinkCache): Promise<void> {
	const token = String(args ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
	const locale = i18n.getLocale();

	if (token === "on" || token === "auto" || token === "enable") {
		setEnabled(cache, true);
		const langName = localeNeedsTranslate(locale) ? locale : `${locale}（提示：英文 locale 下 think 无实际效果，先 /lang <语言>）`;
		ctx.ui?.notify?.(`think: 已开启（跟随 /lang 当前 locale=${langName}），发送消息时即生效`, "info");
		// 首次由 before_provider_request 同步兜底翻译；预翻译留到下次 session_start（reload/重启）。
		return;
	}
	if (token === "off" || token === "disable") {
		setEnabled(cache, false);
		ctx.ui?.notify?.("think: 已关闭（LLM 回到英文 description）", "info");
		return;
	}
	if (token === "clear") {
		const cleared = clearLocale(cache, locale);
		ctx.ui?.notify?.(`think: 已清除 locale=${locale} 的缓存（${cleared} 条）`, "info");
		return;
	}
	if (token === "clear-all") {
		const cleared = clearLocale(cache);
		ctx.ui?.notify?.(`think: 已清除全部 locale 缓存（${cleared} 条）`, "info");
		return;
	}
	if (token === "doctor") {
		await runThinkDoctor(ctx, i18n, cache);
		return;
	}
	if (token === "" || token === "status") {
		ctx.ui?.notify?.(
			`think: ${isEnabled(cache) ? "已开启" : "已关闭"}（locale=${locale}，语言由 /lang 决定）`,
			"info",
		);
		return;
	}
	ctx.ui?.notify?.("用法：/lang think on | off | doctor | clear | clear-all（on 跟随当前 locale，off 关闭，doctor 诊断，clear 清当前 locale 缓存）", "info");
}

/** 重置诊断（/lang debug 时可附加 think 状态）。 */
export function getThinkDebug(cache: ThinkCache, i18n: I18nApi): string {
	const locale = i18n.getLocale();
	const locData = cache.locales[locale];
	const toolCount = locData ? Object.keys(locData.tool).length : 0;
	const paramCount = locData ? Object.keys(locData.param).length : 0;
	return `think.enabled=${cache.enabled} locale=${locale} cached(tool=${toolCount} param=${paramCount})`;
}

/**
 * /lang think doctor：报告当前 locale 的缓存命中/过期/pending 状态。
 * 过期 = 缓存 en 原文与当前 session 工具的 en 不一致（pi 升级后失效）。
 */
export async function runThinkDoctor(ctx: any, i18n: I18nApi, cache: ThinkCache): Promise<void> {
	const locale = i18n.getLocale();
	const locData = cache.locales[locale];
	const cachedTool = locData ? Object.keys(locData.tool).length : 0;
	const cachedParam = locData ? Object.keys(locData.param).length : 0;
	const baseline = countBaseline(locale);

	// session 工具的过期/pending 检测（ctx.getAllTools 不可用时报 N/A）
	let sessionTool = 0;
	let sessionParam = 0;
	let expired = 0;
	let pending = 0;
	let sessionInfo = "N/A（getAllTools 不可用）";
	try {
		const tools = (ctx as any)?.getAllTools?.() ?? [];
		for (const t of tools) {
			if (!t?.name) continue;
			sessionTool++;
			if (typeof t.description === "string" && t.description) {
				const entry = locData?.tool[t.name];
				if (entry && entry.en !== t.description) expired++;
				if (!getBaselineTranslation(locale, "tool", t.name) && !getCachedEntry(cache, locale, "tool", t.name, t.description)) pending++;
			}
			const params = extractParamDescriptions(t.parameters, t.name);
			sessionParam += params.length;
			for (const p of params) {
				const entry = locData?.param[p.key];
				if (entry && entry.en !== p.en) expired++;
				if (!getBaselineTranslation(locale, "param", p.key) && !getCachedEntry(cache, locale, "param", p.key, p.en)) pending++;
			}
		}
		sessionInfo = `${sessionTool} tools, ${sessionParam} params`;
	} catch {
		// keep N/A
	}

	const lines = [
		`think.doctor locale=${locale} enabled=${cache.enabled}`,
		`session: ${sessionInfo}`,
		`baseline 覆盖: ${baseline.tool} tools, ${baseline.param} params（零等待）`,
		`缓存: ${cachedTool} tools, ${cachedParam} params`,
		`过期(待重翻): ${expired}`,
		`pending(待翻译): ${pending}`,
	];
	ctx.ui?.notify?.(lines.join("\n"), expired > 0 ? "warning" : "info");
}
