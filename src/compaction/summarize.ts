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

async function runSummary(ctx: any, prompt: string, signal?: AbortSignal): Promise<string | undefined> {
	// 默认用当前会话模型；若配置了 override 则用 override
	let model = ctx.model;
	if (!model) {
		ctx.ui.notify("No active model for compaction summarization; falling back to pi default compaction.", "warning");
		return undefined;
	}

	if (compactionConfig.model) {
		const slashIndex = compactionConfig.model.indexOf("/");
		if (slashIndex !== -1) {
			const provider = compactionConfig.model.slice(0, slashIndex);
			const modelId = compactionConfig.model.slice(slashIndex + 1);
			const resolved = getModel(provider, modelId);
			if (resolved) model = resolved;
		}
	}

	const { apiKey, headers } = await resolveModelAuth(ctx, model);
	if (!apiKey) {
		ctx.ui.notify(
			`pi-di18n compaction could not get API key for provider "${model.provider}"; falling back to pi default compaction.`,
			"warning",
		);
		return undefined;
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

	return text || undefined;
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

	const summary = await runSummary(ctx, prompt, event.signal);
	if (!summary) return undefined;

	return {
		compaction: {
			summary,
			firstKeptEntryId: event.preparation.firstKeptEntryId,
			tokensBefore: event.preparation.tokensBefore,
			details: {
				locale,
				languageInstruction,
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

	const summary = await runSummary(ctx, prompt, event.signal);
	if (!summary) return undefined;

	return {
		summary: {
			summary,
			details: {
				locale,
				languageInstruction,
				source: "pi-di18n",
			},
		},
	};
}
