// 摘要事件处理器（整合自 pi-compaction-i18n）。
//
// 整合差异：原 pi-compaction-i18n 自己读环境变量/独立 config 决定 locale。
// 并入 pi-di18n 后，locale 由 index.ts 通过 i18n.getLocale() 传入，与 TUI 的
// /lang 语言选择共享同一个真相源。本模块只保留 model override 的独立 config。

import { complete, getEnvApiKey, getModel } from "@earendil-works/pi-ai";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { languageInstructionForLocale } from "./locale.ts";
import { buildCompactionPrompt, buildTreeSummaryPrompt } from "./templates.ts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { statePath } from "../state-paths.js";

// ── Config（仅 model override；locale 走 i18n api）──────────────────────

interface CompactionConfig {
	model?: string; // e.g. "zai/glm-5v-turbo"，空 = 用当前会话模型
}

const CONFIG_PATH = statePath("compaction.json");

const DEFAULT_CONFIG: CompactionConfig = {
	model: "",
};

function loadConfig(): CompactionConfig {
	try {
		if (!existsSync(CONFIG_PATH)) {
			mkdirSync(dirname(CONFIG_PATH), { recursive: true });
			writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
			return DEFAULT_CONFIG;
		}
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		return JSON.parse(raw) as CompactionConfig;
	} catch {
		return DEFAULT_CONFIG;
	}
}

const compactionConfig = loadConfig();

// ── 核心逻辑 ────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
	"You are a conversation summarizer for pi. Follow the requested language exactly and output only the requested structured markdown summary.";

export function serializeAgentMessages(messages: any[]): string {
	return serializeConversation(convertToLlm(messages));
}

export function entryToAgentMessage(entry: any): any | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	switch (entry.type) {
		case "message":
			return entry.message;
		case "custom_message":
			return {
				role: "custom",
				customType: entry.customType,
				content: entry.content,
				display: entry.display,
				details: entry.details,
				timestamp: new Date(entry.timestamp).getTime(),
			};
		case "branch_summary":
			return {
				role: "branchSummary",
				summary: entry.summary,
				fromId: entry.fromId,
				timestamp: new Date(entry.timestamp).getTime(),
			};
		case "compaction":
			return {
				role: "compactionSummary",
				summary: entry.summary,
				tokensBefore: entry.tokensBefore,
				timestamp: new Date(entry.timestamp).getTime(),
			};
		default:
			return undefined;
	}
}

export function serializeSessionEntries(entries: any[]): string {
	const messages = entries.map(entryToAgentMessage).filter(Boolean);
	return serializeAgentMessages(messages);
}

/**
 * 解析模型 API key（多策略兜底）。
 *
 * 策略顺序：
 *   1. ctx.modelRegistry.getApiKeyAndHeaders() —— 首选，会话感知
 *   2. 直接读 auth.json —— 绕过扩展上下文潜在问题
 *   3. 环境变量 —— 最后兜底
 */
async function resolveModelAuth(
	ctx: any,
	model: any,
): Promise<{ apiKey: string | undefined; headers: Record<string, string> | undefined }> {
	// 策略 1：会话 modelRegistry
	try {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (auth?.ok && auth?.apiKey) {
			return { apiKey: auth.apiKey, headers: auth.headers };
		}
	} catch {
		// 策略 1 失败，继续兜底
	}

	// 策略 2：直接读 auth.json
	try {
		const authPath = join(homedir(), ".pi", "agent", "auth.json");
		if (existsSync(authPath)) {
			const raw = readFileSync(authPath, "utf-8");
			const authData = JSON.parse(raw);
			const cred = authData[model.provider];
			if (cred?.type === "api_key" && cred?.key) {
				return { apiKey: cred.key, headers: undefined };
			}
		}
	} catch {
		// 策略 2 失败，继续兜底
	}

	// 策略 3：环境变量
	try {
		const envKey = getEnvApiKey(model.provider);
		if (envKey) {
			return { apiKey: envKey, headers: undefined };
		}
	} catch {
		// 策略 3 也失败
	}

	return { apiKey: undefined, headers: undefined };
}

export type CompactionFailureKind =
	| "model_unavailable"
	| "auth"
	| "usage_quota"
	| "rate_limit"
	| "network"
	| "cancelled"
	| "unknown";

export type CompactionModelInfo = {
	provider: string;
	model: string;
};

type SummaryResult =
	| { ok: true; text: string; model: CompactionModelInfo }
	| { ok: false; kind: CompactionFailureKind; model: CompactionModelInfo; message: string };

export function compactionModelInfo(model: any): CompactionModelInfo {
	return {
		provider: String(model?.provider ?? "unknown"),
		model: String(model?.id ?? model?.model ?? "unknown"),
	};
}

export function resolveCompactionModel(
	currentModel: any,
	override: string,
	resolve: (provider: string, modelId: string) => any = getModel,
): { model?: any; info: CompactionModelInfo; error?: string } {
	if (!currentModel) return { info: { provider: "unknown", model: "none" }, error: "No active model" };
	if (!override) return { model: currentModel, info: compactionModelInfo(currentModel) };

	const slashIndex = override.indexOf("/");
	if (slashIndex <= 0 || slashIndex === override.length - 1) {
		return {
			info: { provider: "configured", model: override },
			error: `Invalid compaction model override "${override}"`,
		};
	}
	const provider = override.slice(0, slashIndex);
	const modelId = override.slice(slashIndex + 1);
	const resolved = resolve(provider, modelId);
	if (!resolved) return { info: { provider, model: modelId }, error: "Configured model was not found" };
	return { model: resolved, info: compactionModelInfo(resolved) };
}

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error && typeof error === "object") {
		const value = error as Record<string, unknown>;
		return [value.message, value.error, value.detail].filter(Boolean).map(String).join(" ");
	}
	return String(error);
}

export function classifyCompactionError(error: unknown): CompactionFailureKind {
	const rawCode = String((error as any)?.code ?? "");
	const code = rawCode.toLowerCase();
	const message = errorText(error);

	// Prefer a known provider error code over generic status or message text.
	if (/usage|quota|billing|out.?of.?budget|insufficient[_ -]?(?:quota|balance)/.test(code)) return "usage_quota";
	if (/model[\s_-]*(?:not[\s_-]*found|unavailable)|unknown.?model|invalid.?model/.test(code)) {
		return "model_unavailable";
	}
	if (/auth|credential|api.?key|unauthori[sz]ed|forbidden|insufficient[_ -]?scope/.test(code)) return "auth";
	if (/rate.?limit|too.?many|throttl/.test(code)) return "rate_limit";
	if (/econn|enotfound|network|timeout|timed.?out|socket|websocket|connection/.test(code)) return "network";

	// A known HTTP status outranks an ambiguous provider message.
	const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
	if (status === 401 || status === 403) return "auth";
	if (status === 429) return "rate_limit";

	// Fall back to the human-readable message only when public fields are inconclusive.
	if (/usage.?limit|quota|insufficient.?quota|out of budget|available balance|billing/i.test(message)) {
		return "usage_quota";
	}
	if (/model[\s_-]*(?:not[\s_-]*found|unavailable)|unknown model|invalid model/i.test(message)) {
		return "model_unavailable";
	}
	if (/auth(?:entication|orization)?|invalid.?api.?key/i.test(message)) return "auth";
	if (/rate.?limit|too many requests/i.test(message)) return "rate_limit";
	if (/network|timed? ?out|timeout|connection|connect|fetch failed|econn|enotfound|websocket|socket/i.test(message)) {
		return "network";
	}
	if ((error as any)?.name === "AbortError") return "cancelled";
	return "unknown";
}

function modelLabel(info: CompactionModelInfo): string {
	return `${info.provider}/${info.model}`;
}

function notifyFailure(ctx: any, result: Extract<SummaryResult, { ok: false }>): void {
	if (result.kind === "cancelled") return;
	try {
		ctx?.ui?.notify?.(
			`pi-di18n compaction failed [${result.kind}] with ${modelLabel(result.model)}: ${result.message}`,
			"warning",
		);
	} catch {
		// TUI notification is best-effort; it must not change the cancel result.
	}
}

function unavailableResult(model: CompactionModelInfo, message: string): Extract<SummaryResult, { ok: false }> {
	return { ok: false, kind: "model_unavailable", model, message };
}

async function runSummary(ctx: any, prompt: string, signal?: AbortSignal): Promise<SummaryResult> {
	const resolution = resolveCompactionModel(ctx.model, compactionConfig.model);
	if (!resolution.model) {
		const result = unavailableResult(resolution.info, resolution.error ?? "Model unavailable");
		notifyFailure(ctx, result);
		return result;
	}

	const model = resolution.model;
	const info = resolution.info;
	try {
		const { apiKey, headers } = await resolveModelAuth(ctx, model);
		if (!apiKey) {
			const result: Extract<SummaryResult, { ok: false }> = {
				ok: false,
				kind: "auth",
				model: info,
				message: `No API key for provider ${info.provider}`,
			};
			notifyFailure(ctx, result);
			return result;
		}

		const response = await complete(
			model,
			{
				systemPrompt: DEFAULT_SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey,
				headers,
				signal,
				maxTokens: Math.min(8192, model.maxTokens > 0 ? model.maxTokens : 8192),
			},
		);

		if (response.stopReason === "error" || response.stopReason === "aborted") {
			const result: Extract<SummaryResult, { ok: false }> = {
				ok: false,
				kind:
					response.stopReason === "aborted" || signal?.aborted
						? "cancelled"
						: classifyCompactionError(response.errorMessage),
				model: info,
				message: response.errorMessage || `Provider returned stop reason ${response.stopReason}`,
			};
			notifyFailure(ctx, result);
			return result;
		}

		const text = response.content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n")
			.trim();
		if (!text) {
			const result: Extract<SummaryResult, { ok: false }> = {
				ok: false,
				kind: "unknown",
				model: info,
				message: "Summary response was empty",
			};
			notifyFailure(ctx, result);
			return result;
		}
		return { ok: true, text, model: info };
	} catch (error) {
		const result: Extract<SummaryResult, { ok: false }> = {
			ok: false,
			kind: signal?.aborted ? "cancelled" : classifyCompactionError(error),
			model: info,
			message: errorText(error),
		};
		notifyFailure(ctx, result);
		return result;
	}
}

// ── 富媒体安全边界 ─────────────────────────────────────────────────────

// Pi core 估算图片为固定 ~4800 chars（见 pi-coding-agent compaction.estimateTokens），
// 远低于真实 base64 payload。用序列化后的实际字节数判断是否超阈值，避免大图片
// 跨 compaction 边界继续进入活动上下文。阈值取保守值，只拦真正的大 payload。
export const DEFAULT_MEDIA_PAYLOAD_LIMIT = 512 * 1024; // 512 KB base64

export function mediaPayloadBytes(content: any): number {
	if (!Array.isArray(content)) return 0;
	let bytes = 0;
	for (const block of content) {
		if (block?.type === "image" && typeof block?.data === "string") {
			bytes += block.data.length;
		} else if (block?.type === "video" && typeof block?.data === "string") {
			bytes += block.data.length;
		} else if (block?.type === "audio" && typeof block?.data === "string") {
			bytes += block.data.length;
		}
	}
	return bytes;
}

/**
 * 按 session tree 的完整 turn 推进 `firstKeptEntryId`，使超大富媒体退出活动上下文。
 *
 * 算法：从默认保留边界向前扫，每遇到含超阈值富媒体的 toolResult，
 * 把保留边界推进到该 toolResult 所属 turn 的下一条 user 边界（完整 turn 后），
 * 并收集被推进掉的 entries 以纳入摘要。
 *
 * 不拆开 tool call/result 配对；边界只落在 user 消息或路径起点之前的安全位置。
 */
export function advanceBoundaryForRichMedia(
	entries: any[],
	defaultFirstKeptId: string,
	limit: number = DEFAULT_MEDIA_PAYLOAD_LIMIT,
): { firstKeptEntryId: string; pushedEntries: any[]; oversizedMedia: number; pushedTurns: number } {
	if (!Array.isArray(entries) || entries.length === 0) {
		return { firstKeptEntryId: defaultFirstKeptId, pushedEntries: [], oversizedMedia: 0, pushedTurns: 0 };
	}

	const idx = entries.findIndex((e) => e?.id === defaultFirstKeptId);
	if (idx < 0) {
		return { firstKeptEntryId: defaultFirstKeptId, pushedEntries: [], oversizedMedia: 0, pushedTurns: 0 };
	}

	let cutIndex = idx;
	const pushed: any[] = [];
	let oversizedMedia = 0;

	for (let i = idx; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		const msg = entry.message ?? entry;
		const bytes = mediaPayloadBytes(msg?.content);
		if (bytes <= limit) continue;

		oversizedMedia += bytes;
		// 将该 entry 及其所属 turn 全部纳入推进；turn 终点 = 下一个 user 消息或路径末尾。
		let turnEnd = entries.length;
		for (let j = i + 1; j < entries.length; j++) {
			const role = entries[j]?.message?.role;
			if (role === "user") {
				turnEnd = j;
				break;
			}
		}
		// 收集被推进的 entries
		for (let k = cutIndex; k < turnEnd; k++) {
			if (!pushed.includes(entries[k])) pushed.push(entries[k]);
		}
		cutIndex = turnEnd;
	}

	if (cutIndex === idx) {
		return { firstKeptEntryId: defaultFirstKeptId, pushedEntries: [], oversizedMedia: 0, pushedTurns: 0 };
	}
	if (cutIndex >= entries.length) {
		// 推进后无可保留的安全边界 → 调用方应取消。
		return { firstKeptEntryId: "", pushedEntries: pushed, oversizedMedia, pushedTurns: countTurns(pushed) };
	}
	const next = entries[cutIndex];
	return {
		firstKeptEntryId: next?.id ?? defaultFirstKeptId,
		pushedEntries: pushed,
		oversizedMedia,
		pushedTurns: countTurns(pushed),
	};
}

function countTurns(entries: any[]): number {
	// 一个 turn = 一个 user 消息及其后续非 user 消息。推进掉的 entries 可能以
	// assistant/toolResult 开头（split-turn 场景），此时也算一个完整 turn。
	if (entries.length === 0) return 0;
	let turns = 0;
	let inTurn = false;
	for (const e of entries) {
		const role = e?.message?.role;
		if (role === "user") {
			turns++;
			inTurn = true;
		} else if (!inTurn) {
			// 消息在第一个 user 之前，归入一个 split turn。
			turns++;
			inTurn = true;
		}
	}
	return turns;
}

// ── 事件处理器（locale 由 index.ts 传入）────────────────────────────────

export async function summarizeForCompaction(event: any, ctx: any, locale: string | undefined) {
	const languageInstruction = languageInstructionForLocale(locale);

	const branchEntries: any[] = Array.isArray(event?.branchEntries) ? event.branchEntries : [];
	const guard = advanceBoundaryForRichMedia(branchEntries, event.preparation.firstKeptEntryId);

	if (guard.oversizedMedia > 0 && !guard.firstKeptEntryId) {
		try {
			ctx?.ui?.notify?.(
				`pi-di18n compaction cancelled: rich-media payload (${guard.oversizedMedia} bytes) cannot be safely pushed out of context.`,
				"warning",
			);
		} catch {
			// TUI notification is best-effort.
		}
		return { cancel: true };
	}

	// 被推进掉的完整 turn 在时间线上晚于 pi core 默认要摘要的消息，
	// 拼接顺序为：原 messagesToSummarize → turnPrefixMessages → pushedEntries。
	const allMessagesToSummarize = [
		...event.preparation.messagesToSummarize,
		...event.preparation.turnPrefixMessages,
		...guard.pushedEntries.map(entryToAgentMessage).filter(Boolean),
	];
	const conversationText = serializeAgentMessages(allMessagesToSummarize);

	const prompt = `${languageInstruction}\n\n${buildCompactionPrompt({
		locale,
		conversationText,
		previousSummary: event.preparation.previousSummary,
		customInstructions: event.customInstructions,
	})}`;

	const result = await runSummary(ctx, prompt, event.signal);
	if (!result.ok) return { cancel: true };

	const details: Record<string, unknown> = {
		locale,
		languageInstruction,
		provider: result.model.provider,
		model: result.model.model,
		source: "pi-di18n",
	};
	if (guard.oversizedMedia > 0) {
		details.mediaGuard = {
			pushedTurns: guard.pushedTurns,
			oversizedMedia: guard.oversizedMedia,
			firstKeptEntryId: guard.firstKeptEntryId,
		};
	}

	return {
		compaction: {
			summary: result.text,
			firstKeptEntryId: guard.firstKeptEntryId || event.preparation.firstKeptEntryId,
			tokensBefore: event.preparation.tokensBefore,
			details,
		},
	};
}

export async function summarizeForTree(event: any, ctx: any, locale: string | undefined) {
	if (!event.preparation.userWantsSummary) return undefined;

	const languageInstruction = languageInstructionForLocale(locale);
	const conversationText = serializeSessionEntries(event.preparation.entriesToSummarize ?? []);

	const prompt = `${languageInstruction}\n\n${buildTreeSummaryPrompt({
		locale,
		conversationText,
		customInstructions: event.preparation.customInstructions,
	})}`;

	const result = await runSummary(ctx, prompt, event.signal);
	if (!result.ok) return { cancel: true };

	return {
		summary: {
			summary: result.text,
			details: {
				locale,
				languageInstruction,
				provider: result.model.provider,
				model: result.model.model,
				source: "pi-di18n",
			},
		},
	};
}
