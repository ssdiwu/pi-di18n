import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.PI_DI18N_STATE_DIR = "/dev/null"; });

import { getApiProvider, registerApiProvider } from "@earendil-works/pi-ai/compat";
import { summarizeForCompaction } from "../src/compaction/summarize.ts";

describe("compaction OpenAI Responses compatibility metadata", () => {
	it("reproduces an unsupported explicit-cache flag and accepts the corrected model metadata", async () => {
		const adapter = getApiProvider("openai-responses")!;
		const payloads: Record<string, unknown>[] = [];
		const fetchFixture = async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input, init);
			const body = await request.json() as Record<string, unknown>;
			payloads.push(body);
			if (body.prompt_cache_options) {
				return new Response(JSON.stringify({ error: { message: "Unsupported parameter: prompt_cache_options", type: "invalid_request_error", param: "prompt_cache_options" } }), { status: 400, headers: { "content-type": "application/json" } });
			}
			const message = { id: "fixture-message", type: "message", role: "assistant", content: [] };
			const events = [
				{ type: "response.output_item.added", output_index: 0, item: message },
				{ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
				{ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "## Fixture summary" },
				{ type: "response.output_item.done", output_index: 0, item: { ...message, content: [{ type: "output_text", text: "## Fixture summary", annotations: [] }] } },
				{ type: "response.completed", response: { id: "fixture-response", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
			];
			return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
		};
		registerApiProvider({
			api: "openai-responses",
			stream: (model, context, options) => adapter.stream(model, context, { ...options, fetch: fetchFixture as typeof fetch }),
			streamSimple: adapter.streamSimple,
		} as any);
		const model = {
			provider: "openai", api: "openai-responses", id: "fixture-model", name: "Fixture model",
			baseUrl: "https://fixture.invalid/v1", reasoning: false, input: ["text"],
			maxTokens: 8192, contextWindow: 272000,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			compat: { supportsExplicitPromptCacheMode: true },
		};
		const event = { preparation: { messagesToSummarize: [], turnPrefixMessages: [], firstKeptEntryId: "entry-1", tokensBefore: 123 }, signal: new AbortController().signal };
		const ctx = { model, modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fixture-key", headers: {} }) }, ui: { notify: vi.fn() } };
		try {
			expect(await summarizeForCompaction(event, ctx, "zh-CN")).toEqual({ cancel: true });
			expect(payloads).toHaveLength(1);
			expect(payloads[0]).toHaveProperty("prompt_cache_options");
			expect(ctx.ui.notify.mock.calls[0]?.[0]).toContain("Unsupported parameter: prompt_cache_options");
			model.compat.supportsExplicitPromptCacheMode = false;
			expect(await summarizeForCompaction(event, ctx, "zh-CN")).toHaveProperty("compaction.summary", "## Fixture summary");
			expect(payloads).toHaveLength(2);
			expect(payloads[1]).not.toHaveProperty("prompt_cache_options");
			expect(payloads[1]).not.toHaveProperty("prompt_cache_key");
		} finally {
			registerApiProvider(adapter as any);
		}
	});
});
