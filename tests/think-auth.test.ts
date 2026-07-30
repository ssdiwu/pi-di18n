import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());
const getEnvApiKeyMock = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({
	complete: completeMock,
	getEnvApiKey: getEnvApiKeyMock,
}));

import { translateBatch } from "../src/think/translator.ts";

describe("runtime think translation auth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getEnvApiKeyMock.mockReturnValue(undefined);
	});

	it("uses header-only auth and provider-scoped env", async () => {
		completeMock.mockResolvedValueOnce({
			content: [{ type: "text", text: '{"custom":"已翻译"}' }],
		});
		const ctx = {
			model: { provider: "header-provider", id: "model", maxTokens: 8192 },
			modelRegistry: {
				getApiKeyAndHeaders: vi.fn().mockResolvedValue({
					ok: true,
					headers: { Authorization: "Bearer test-token" },
					env: { PROVIDER_TOKEN: "test-token" },
				}),
			},
		};

		const result = await translateBatch(ctx, [{ key: "custom", en: "Translate me" }], "zh-CN");

		expect(result.get("custom")).toBe("已翻译");
		expect(completeMock).toHaveBeenCalledTimes(1);
		expect(completeMock.mock.calls[0]?.[2]).toMatchObject({
			headers: { Authorization: "Bearer test-token" },
			env: { PROVIDER_TOKEN: "test-token" },
		});
	});
});
