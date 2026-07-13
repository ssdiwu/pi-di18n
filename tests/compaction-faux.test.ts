import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.PI_DI18N_STATE_DIR = "/dev/null";
});

import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai";
import { summarizeForCompaction } from "../src/compaction/summarize.ts";

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

describe("compaction faux provider error protocol", () => {
	let unregister: (() => void) | undefined;

	afterEach(() => {
		unregister?.();
		unregister = undefined;
	});

	it.each(["manual", "threshold"] as const)("cancels %s for resolved stopReason=error", async (reason) => {
		const provider = registerFauxProvider({
			provider: `compaction-faux-${reason}`,
			api: `compaction-faux-api-${reason}`,
			models: [{ id: "failure-model" }],
		});
		unregister = provider.unregister;
		provider.setResponses([
			fauxAssistantMessage("partial text", {
				stopReason: "error",
				errorMessage: "rate limit exceeded",
			}),
		]);
		const notifications: string[] = [];
		const ctx = {
			model: provider.getModel(),
			modelRegistry: {
				getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "faux-key", headers: {} }),
			},
			ui: { notify: (message: string) => notifications.push(message) },
		};

		const result = await summarizeForCompaction(makeEvent(reason), ctx, "zh-CN");

		expect(provider.state.callCount).toBe(1);
		expect(result).toEqual({ cancel: true });
		expect(notifications[0]).toContain("[rate_limit]");
		expect(notifications[0]).toContain(`${ctx.model.provider}/${ctx.model.id}`);
	});
});
