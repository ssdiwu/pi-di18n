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
	if (/usage|quota|billing|out.?of.?budget|insufficient/.test(code)) return "usage_quota";
	if (/model[\s_-]*(?:not[\s_-]*found|unavailable)|unknown.?model|invalid.?model/.test(code)) {
		return "model_unavailable";
	}
	if (/auth|credential|api.?key|unauthori[sz]ed|forbidden/.test(code)) return "auth";
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

// ── 事件处理器（locale 由 index.ts 传入）────────────────────────────────

export async function summarizeForCompaction(event: any, ctx: any, locale: string | undefined) {
	const languageInstruction = languageInstructionForLocale(locale);
	const conversationText = serializeAgentMessages([
		...event.preparation.messagesToSummarize,
		...event.preparation.turnPrefixMessages,
	]);

	const prompt = `${languageInstruction}\n\n${buildCompactionPrompt({
		locale,
		conversationText,
		previousSummary: event.preparation.previousSummary,
		customInstructions: event.customInstructions,
	})}`;

	const result = await runSummary(ctx, prompt, event.signal);
	if (!result.ok) return { cancel: true };

	return {
		compaction: {
			summary: result.text,
			firstKeptEntryId: event.preparation.firstKeptEntryId,
			tokensBefore: event.preparation.tokensBefore,
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
