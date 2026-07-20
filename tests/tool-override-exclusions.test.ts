import { describe, expect, it, vi } from "vitest";
import { getDisabledBuiltinToolOverrides } from "../src/config.ts";

describe("localized built-in tool exclusions", () => {
	it("keeps only supported tool names", () => {
		const disabled = getDisabledBuiltinToolOverrides({
			disabledBuiltinToolOverrides: ["read", "edit", "unknown"],
		} as any);

		expect([...disabled]).toEqual(["read", "edit"]);
	});

	it("does not register tool names reserved for another extension", async () => {
		vi.resetModules();
		const { installLocalizedToolsOnce } = await import("../src/pi-ui.ts");
		const tools: string[] = [];
		const pi = {
			events: { on() {} },
			registerTool(tool: { name: string }) {
				tools.push(tool.name);
			},
		};
		const i18n = { t: (key: string) => key };

		installLocalizedToolsOnce(pi as any, i18n as any, new Set(["read", "edit"]));

		expect(tools).toEqual(["bash", "write"]);
	});
});
