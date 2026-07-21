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


import { summarizeForCompaction } from "../src/compaction/summarize.ts";

const sessionModel = { provider: "test-provider", id: "session-model", maxTokens: 8192 };
const IMAGE_DATA = "A".repeat(2_300_000); // ~2.3 MB base64 payload

function textMessage(id: string, parentId: string | null, text: string) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: Date.now(),
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

function assistantToolCall(id: string, parentId: string, toolCallId: string, name: string) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: Date.now(),
		message: {
			role: "assistant",
			content: [{ type: "toolCall", id: toolCallId, name, arguments: {} }],
		},
	};
}

function toolResultImage(id: string, parentId: string, toolCallId: string, imageBytes: string) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: Date.now(),
		message: {
			role: "toolResult",
			toolCallId,
			content: [
				{ type: "text", text: "Read image file [image/png]" },
				{ type: "image", data: imageBytes, mimeType: "image/png" },
			],
		},
	};
}

function toolResultText(id: string, parentId: string, toolCallId: string, text: string) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: Date.now(),
		message: {
			role: "toolResult",
			toolCallId,
			content: [{ type: "text", text }],
		},
	};
}

function makeEvent(entries: any[], defaultFirstKept: string) {
	const preparation = {
		firstKeptEntryId: defaultFirstKept,
		messagesToSummarize: [],
		turnPrefixMessages: [],
		previousSummary: undefined,
		tokensBefore: 352_100,
		isSplitTurn: false,
	};
	return {
		type: "session_before_compact",
		reason: "manual",
		willRetry: false,
		preparation,
		branchEntries: entries,
		customInstructions: undefined,
		signal: new AbortController().signal,
	};
}

function ctx() {
	return {
		model: sessionModel,
		modelRegistry: {
			getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "key", headers: {} }),
		},
		ui: { notify: vi.fn() },
	};
}

describe("rich-media compaction boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("pushes firstKeptEntryId past a large image tool result so it exits active context", async () => {
		const entries = [
			textMessage("e1", null, "请分析图片"),
			assistantToolCall("e2", "e1", "call-1", "read"),
			toolResultImage("e3", "e2", "call-1", IMAGE_DATA),
			textMessage("e4", "e3", "继续"),
		];
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(makeEvent(entries, "e3"), ctx(), "zh-CN");

		expect(result).toMatchObject({ compaction: expect.any(Object) });
		expect(result.compaction.firstKeptEntryId).toBe("e4");
	});

	it("keeps a small image tool result on the default boundary", async () => {
		const entries = [
			textMessage("e1", null, "请分析图片"),
			assistantToolCall("e2", "e1", "call-1", "read"),
			toolResultImage("e3", "e2", "call-1", "small"),
			textMessage("e4", "e3", "继续"),
		];
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(makeEvent(entries, "e3"), ctx(), "zh-CN");

		expect(result.compaction.firstKeptEntryId).toBe("e3");
	});

	it("summarizes the pushed-out turn in time order and records media diagnostics without payload", async () => {
		const entries = [
			textMessage("e1", null, "请分析图片"),
			assistantToolCall("e2", "e1", "call-1", "read"),
			toolResultImage("e3", "e2", "call-1", IMAGE_DATA),
			textMessage("e4", "e3", "继续"),
		];
		const event = makeEvent(entries, "e3");
		event.preparation.messagesToSummarize = [entries[0].message, entries[1].message];
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(event, ctx(), "zh-CN");

		expect(completeMock).toHaveBeenCalledTimes(1);
		const prompt = completeMock.mock.calls[0][1].messages[0].content[0].text;
		expect(prompt).toContain("Read image file");
		expect(prompt).not.toContain(IMAGE_DATA);
		expect(prompt.indexOf("请分析图片")).toBeLessThan(prompt.indexOf("Read image file"));
		expect(result.compaction.details.mediaGuard).toMatchObject({
			pushedTurns: 1,
			oversizedMedia: expect.any(Number),
		});
		expect(JSON.stringify(result.compaction.details)).not.toContain(IMAGE_DATA);
	});

	it("cancels when the only safe boundary still keeps an oversized media turn", async () => {
		const entries = [
			textMessage("e1", null, "请分析图片"),
			assistantToolCall("e2", "e1", "call-1", "read"),
			toolResultImage("e3", "e2", "call-1", IMAGE_DATA),
		];
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(makeEvent(entries, "e3"), ctx(), "zh-CN");

		expect(result).toEqual({ cancel: true });
		expect(completeMock).not.toHaveBeenCalled();
	});

	it("preserves pure-text tool results with the default boundary", async () => {
		const entries = [
			textMessage("e1", null, "请读取文件"),
			assistantToolCall("e2", "e1", "call-1", "read"),
			toolResultText("e3", "e2", "call-1", "文件内容：hello world".repeat(200)),
			textMessage("e4", "e3", "继续"),
		];
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(makeEvent(entries, "e3"), ctx(), "zh-CN");

		expect(result.compaction.firstKeptEntryId).toBe("e3");
	});

	it("handles a real pi-core split-turn boundary with oversized image in the retained region", async () => {
		const { prepareCompaction } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js"
		);
		const { buildSessionContext } = await import(
			"../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"
		);

		// 构造 hc=8, htl=3000, aul=500 的会话：prepareCompaction 产生 isSplitTurn=true，
		// 切点落在历史 assistant(ha6)，大图片 toolResult(tr) 在保留区内。
		const entries: any[] = [];
		let prevId: string | null = null;
		for (let i = 0; i < 8; i++) {
			const uid = `hu${i}`;
			const aid = `ha${i}`;
			entries.push({
				type: "message",
				id: uid,
				parentId: prevId,
				timestamp: Date.now(),
				message: { role: "user", content: [{ type: "text", text: "x".repeat(3000) }] },
			});
			prevId = uid;
			entries.push({
				type: "message",
				id: aid,
				parentId: prevId,
				timestamp: Date.now(),
				message: { role: "assistant", content: [{ type: "text", text: "y".repeat(3000) }] },
			});
			prevId = aid;
		}
		// 大图片 turn
		entries.push({
			type: "message",
			id: "tu",
			parentId: prevId,
			timestamp: Date.now(),
			message: { role: "user", content: [{ type: "text", text: "看图" }] },
		});
		entries.push({
			type: "message",
			id: "ta",
			parentId: "tu",
			timestamp: Date.now(),
			message: {
				role: "assistant",
				content: [{ type: "toolCall", id: "big-call", name: "read", arguments: {} }],
			},
		});
		entries.push({
			type: "message",
			id: "tr",
			parentId: "ta",
			timestamp: Date.now(),
			message: {
				role: "toolResult",
				toolCallId: "big-call",
				content: [
					{ type: "text", text: "Read image file [image/png]" },
					{ type: "image", data: IMAGE_DATA, mimeType: "image/png" },
				],
			},
		});
		// 后续 user（安全边界候选）
		entries.push({
			type: "message",
			id: "au",
			parentId: "tr",
			timestamp: Date.now(),
			message: { role: "user", content: [{ type: "text", text: "z".repeat(500) }] },
		});

		// 用真实 prepareCompaction 获取 pi core 的默认切点
		const settings = { enabled: true, keepRecentTokens: 3000, reserveTokens: 32000 };
		const prep = prepareCompaction(entries, settings);
		expect(prep, "prepareCompaction should produce a preparation").toBeDefined();
		// 确认 pi core 产生了 split-turn 切点
		expect(prep.isSplitTurn).toBe(true);
		// 确认默认边界在大图片之前（大图片在保留区）
		const defaultIdx = entries.findIndex((e) => e.id === prep.firstKeptEntryId);
		const imageIdx = entries.findIndex((e) => e.id === "tr");
		expect(defaultIdx).toBeLessThan(imageIdx);

		const event: any = {
			type: "session_before_compact",
			reason: "threshold",
			willRetry: false,
			preparation: prep,
			branchEntries: entries,
			customInstructions: undefined,
			signal: new AbortController().signal,
		};
		completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "## 摘要" }] });

		const result: any = await summarizeForCompaction(event, ctx(), "zh-CN");

		expect(result.compaction).toBeDefined();
		// 推进后的边界必须在大图片 toolResult 之后
		const newIdx = entries.findIndex((e) => e.id === result.compaction.firstKeptEntryId);
		expect(newIdx).toBeGreaterThan(imageIdx);
		// 边界落在完整 turn 后的 user（tool call/result 不被拆开）
		expect(entries[newIdx]?.message?.role).toBe("user");
		expect(result.compaction.firstKeptEntryId).toBe("au");

		// mediaGuard 诊断记录推进信息和边界 ID
		expect(result.compaction.details.mediaGuard).toMatchObject({
			pushedTurns: expect.any(Number),
			oversizedMedia: expect.any(Number),
			firstKeptEntryId: "au",
		});
		expect(result.compaction.details.mediaGuard.oversizedMedia).toBeGreaterThan(0);

		// 大图片 payload 不在 details 中
		expect(JSON.stringify(result.compaction.details)).not.toContain(IMAGE_DATA);

		// 被推进的完整 turn（含 toolResult 文字和 user prefix）按序进入摘要
		const prompt = completeMock.mock.calls[0][1].messages[0].content[0].text;
		expect(prompt).toContain("Read image file");
		expect(prompt).toContain("看图"); // 大图片 turn 的 user prefix
		expect(prompt).not.toContain(IMAGE_DATA);
		// 时间顺序：messagesToSummarize 在 pushedEntries 之前
		expect(prompt.indexOf("hu0")).toBeLessThan(prompt.indexOf("看图"));

		// 用真实 buildSessionContext 验证推进后活动上下文不含 payload 和孤立 tool call
		const compactionEntry = {
			type: "compaction",
			id: "comp-1",
			parentId: "au",
			timestamp: new Date().toISOString(),
			summary: result.compaction.summary,
			firstKeptEntryId: result.compaction.firstKeptEntryId,
			tokensBefore: prep.tokensBefore,
		};
		const byId = new Map<string, any>();
		for (const e of entries) byId.set(e.id, e);
		byId.set(compactionEntry.id, compactionEntry);
		const allEntries = [...entries, compactionEntry];
		const sessionContext = buildSessionContext(allEntries, compactionEntry.id, byId);
		const serialized = JSON.stringify(sessionContext.messages);
		expect(serialized).not.toContain(IMAGE_DATA);
		expect(serialized).not.toContain("big-call");
	});
});
