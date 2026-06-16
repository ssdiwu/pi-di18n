import { describe, expect, it } from "vitest";
import { buildCompactionPrompt, buildTreeSummaryPrompt, localizedSummaryFormat } from "../src/compaction/templates.ts";

describe("compaction templates", () => {
	it("uses localized Chinese headings", () => {
		const format = localizedSummaryFormat("zh-CN");
		expect(format).toContain("## 目标");
		expect(format).toContain("### 已完成");
		expect(format).toContain("## 下一步");
	});

	it("uses English fallback headings", () => {
		const format = localizedSummaryFormat("en-US");
		expect(format).toContain("## Goal");
		expect(format).toContain("### Done");
		expect(format).toContain("## Next Steps");
	});

	it("builds compaction prompt with previous summary and instructions", () => {
		const prompt = buildCompactionPrompt({
			locale: "zh-CN",
			conversationText: "[User]: hi",
			previousSummary: "older summary",
			customInstructions: "focus on blockers",
		});

		expect(prompt).toContain("<conversation>");
		expect(prompt).toContain("<previous-summary>");
		expect(prompt).toContain("focus on blockers");
		expect(prompt).toContain("## 目标");
	});

	it("builds tree summary prompt", () => {
		const prompt = buildTreeSummaryPrompt({
			locale: "ja-JP",
			conversationText: "[User]: hi",
			customInstructions: "focus on branch handoff",
		});

		expect(prompt).toContain("<branch-conversation>");
		expect(prompt).toContain("focus on branch handoff");
		expect(prompt).toContain("## 目標");
	});
});
