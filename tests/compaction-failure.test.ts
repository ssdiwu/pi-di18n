import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.PI_DI18N_STATE_DIR = "/dev/null";
});

const completeMock = vi.hoisted(() => vi.fn());
const getModelMock = vi.hoisted(() => vi.fn());
const getEnvApiKeyMock = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({
	complete: completeMock,
	getModel: getModelMock,
	getEnvApiKey: getEnvApiKeyMock,
}));


import {
	classifyCompactionError,
	resolveCompactionModel,
	summarizeForCompaction,
} from "../src/compaction/summarize.ts";

const sessionModel = {
	provider: "test-provider",
	id: "session-model",
	maxTokens: 8192,
};

function makeContext() {
	return {
		model: sessionModel,
		modelRegistry: {
			getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key", headers: {} }),
		},
		ui: { notify: vi.fn() },
	};
}

function makeEvent(reason: "manual" | "threshold") {
	return {
		preparation: {
			messagesToSummarize: [],
			turnPrefixMessages: [],
			previousSummary: undefined,
			firstKeptEntryId: "entry-1",
			tokensBefore: 123,
		},
		customInstructions: undefined,
		reason,
		signal: new AbortController().signal,
	};
}

describe("compaction failure strategy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getModelMock.mockReturnValue({
			provider: "override-provider",
			id: "override-model",
			maxTokens: 8192,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(["manual", "threshold"] as const)("cancels %s compaction after one failed summary request", async (reason) => {
		completeMock.mockRejectedValueOnce(new Error("Model not found override-model"));
		const ctx = makeContext();

		const result = await summarizeForCompaction(makeEvent(reason), ctx, "zh-CN");

		expect(completeMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ cancel: true });
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("test-provider/session-model"), "warning");
	});

	it.each(["manual", "threshold"] as const)("cancels %s after retryable error responses are exhausted", async (reason) => {
		vi.useFakeTimers();
		completeMock.mockResolvedValue({
			stopReason: "error",
			errorMessage: "rate limit exceeded",
			content: [{ type: "text", text: "partial text must not become a summary" }],
		});
		const ctx = makeContext();

		const pending = summarizeForCompaction(makeEvent(reason), ctx, "zh-CN");
		await vi.runAllTimersAsync();
		const result = await pending;

		expect(completeMock).toHaveBeenCalledTimes(4);
		expect(result).toEqual({ cancel: true });
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("[rate_limit]"), "warning");
	});

	it.each(["manual", "threshold"] as const)("keeps successful %s summaries as extension compaction results", async (reason) => {
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## Summary" }] });

		const result = await summarizeForCompaction(makeEvent(reason), makeContext(), "zh-CN");

		expect(completeMock).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			compaction: {
				summary: "## Summary",
				firstKeptEntryId: "entry-1",
				tokensBefore: 123,
				details: {
					provider: "test-provider",
					model: "session-model",
				},
			},
		});
	});

	it.each([
		["Model not found override-model", "model_unavailable"],
		["You have hit your ChatGPT usage limit", "usage_quota"],
		["rate limit exceeded", "rate_limit"],
		["fetch failed: ECONNRESET", "network"],
		["provider returned an unexpected response", "unknown"],
	] as const)("classifies %s", (message, expected) => {
		expect(classifyCompactionError(new Error(message))).toBe(expected);
	});

	it("reads public error codes and resolves a configured override", () => {
		expect(classifyCompactionError({ code: "bad_request", message: "model not found" })).toBe("model_unavailable");
		expect(
			classifyCompactionError({ status: 429, code: "insufficient_quota", message: "provider rejected request" }),
		).toBe("usage_quota");
		expect(classifyCompactionError({ code: "network_error", message: "ECONNRESET" })).toBe("network");
		expect(classifyCompactionError({ status: 429, code: "bad_request", message: "model not found" })).toBe(
			"rate_limit",
		);
		expect(classifyCompactionError({ status: 401, code: "bad_request", message: "quota exceeded" })).toBe("auth");
		expect(classifyCompactionError({ status: 403, code: "insufficient_scope", message: "scope required" })).toBe("auth");

		const resolved = { provider: "override-provider", id: "override-model", maxTokens: 8192 };
		getModelMock.mockReturnValueOnce(resolved);
		const result = resolveCompactionModel(sessionModel, "override-provider/override-model", getModelMock);

		expect(getModelMock).toHaveBeenCalledWith("override-provider", "override-model");
		expect(result).toMatchObject({ model: resolved, info: { provider: "override-provider", model: "override-model" } });
	});

	it("still returns cancel when the notification renderer throws", async () => {
		completeMock.mockRejectedValueOnce(new Error("Model not found"));
		const ctx = makeContext();
		ctx.ui.notify.mockImplementation(() => {
			throw new Error("TUI render failed");
		});

		await expect(summarizeForCompaction(makeEvent("manual"), ctx, "zh-CN")).resolves.toEqual({ cancel: true });
	});
});
