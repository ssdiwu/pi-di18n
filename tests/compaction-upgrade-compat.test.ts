import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { summarizeForCompaction, summarizeForTree } from "../src/compaction/summarize.ts";

const model = {
	provider: "upgrade-compat-provider",
	id: "upgrade-compat-model",
	maxTokens: 8192,
};

const usage = {
	input: 100,
	output: 20,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 120,
	cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
};

function success(text = "## Summary") {
	return {
		stopReason: "stop",
		content: [{ type: "text", text }],
		usage,
	};
}

function context(auth: Record<string, unknown> = { ok: true, apiKey: "key", headers: {} }) {
	return {
		model,
		modelRegistry: { getApiKeyAndHeaders: vi.fn().mockResolvedValue(auth) },
		ui: { notify: vi.fn() },
	};
}

function compactionEvent(signal: AbortSignal = new AbortController().signal) {
	return {
		reason: "manual",
		willRetry: false,
		branchEntries: [],
		preparation: {
			messagesToSummarize: [],
			turnPrefixMessages: [],
			previousSummary: undefined,
			firstKeptEntryId: "entry-1",
			tokensBefore: 123,
		},
		customInstructions: undefined,
		signal,
	};
}

function treeEvent() {
	return {
		preparation: {
			userWantsSummary: true,
			entriesToSummarize: [],
			customInstructions: undefined,
		},
		signal: new AbortController().signal,
	};
}

describe("Pi 0.81-0.82 compaction compatibility", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
		getEnvApiKeyMock.mockReturnValue(undefined);
	});

	it("accepts header-only auth and forwards provider-scoped env", async () => {
		completeMock.mockResolvedValueOnce(success());
		const ctx = context({
			ok: true,
			headers: { Authorization: "Bearer test-token" },
			env: { ANTHROPIC_AUTH_TOKEN: "test-token" },
		});

		const result = await summarizeForCompaction(compactionEvent(), ctx, "zh-CN");

		expect(result).toHaveProperty("compaction.summary", "## Summary");
		expect(completeMock).toHaveBeenCalledTimes(1);
		expect(completeMock.mock.calls[0]?.[2]).toMatchObject({
			headers: { Authorization: "Bearer test-token" },
			env: { ANTHROPIC_AUTH_TOKEN: "test-token" },
		});
	});

	it("returns provider usage for compaction and tree summaries", async () => {
		completeMock.mockResolvedValue(success());

		const compacted = await summarizeForCompaction(compactionEvent(), context(), "zh-CN");
		const tree = await summarizeForTree(treeEvent(), context(), "zh-CN");

		expect(compacted).toHaveProperty("compaction.usage", usage);
		expect(tree).toHaveProperty("summary.usage", usage);
	});

	it("isolates every summary request from cache and routing reuse", async () => {
		completeMock.mockResolvedValue(success());

		await summarizeForCompaction(compactionEvent(), context(), "zh-CN");
		await summarizeForTree(treeEvent(), context(), "zh-CN");

		const first = completeMock.mock.calls[0]?.[2];
		const second = completeMock.mock.calls[1]?.[2];
		expect(first).toMatchObject({ cacheRetention: "none" });
		expect(second).toMatchObject({ cacheRetention: "none" });
		expect(first?.sessionId).toEqual(expect.any(String));
		expect(second?.sessionId).toEqual(expect.any(String));
		expect(first.sessionId).not.toBe(second.sessionId);
	});

	it("retries transient failures but not deterministic auth failures", async () => {
		vi.useFakeTimers();
		completeMock
			.mockResolvedValueOnce({
				stopReason: "error",
				errorMessage: "fetch failed: ECONNRESET",
				content: [],
			})
			.mockResolvedValueOnce(success("## Retried"));

		const retrying = summarizeForCompaction(compactionEvent(), context(), "zh-CN");
		await vi.runAllTimersAsync();
		await expect(retrying).resolves.toHaveProperty("compaction.summary", "## Retried");
		expect(completeMock).toHaveBeenCalledTimes(2);

		vi.clearAllMocks();
		completeMock.mockResolvedValueOnce({
			stopReason: "error",
			errorMessage: "invalid api key",
			content: [],
		});
		await expect(summarizeForCompaction(compactionEvent(), context(), "zh-CN")).resolves.toEqual({ cancel: true });
		expect(completeMock).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it("cancels a scheduled retry when the summary signal aborts", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		completeMock.mockResolvedValueOnce({
			stopReason: "error",
			errorMessage: "network timeout",
			content: [],
		});

		const pending = summarizeForCompaction(compactionEvent(controller.signal), context(), "zh-CN");
		controller.abort();
		await expect(pending).resolves.toEqual({ cancel: true });
		expect(completeMock).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});
});
