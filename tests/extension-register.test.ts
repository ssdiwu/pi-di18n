import { describe, expect, it } from "vitest";
import extension from "../index.ts";

describe("extension registration", () => {
	it("registers lang command, locale tool, localized tool overrides, and compaction hooks", () => {
		const hooks: string[] = [];
		const eventHandlers: string[] = [];
		const commands: string[] = [];
		const tools: string[] = [];

		const pi = {
			events: {
				on(name: string) {
					eventHandlers.push(name);
				},
				emit() {},
			},
			on(name: string) {
				hooks.push(name);
			},
			registerCommand(name: string) {
				commands.push(name);
			},
			registerTool(tool: { name: string }) {
				tools.push(tool.name);
			},
			getCommands() {
				return [];
			},
		};

		extension(pi as any);

		expect(hooks).toContain("session_start");
		expect(hooks).toContain("session_before_compact");
		expect(hooks).toContain("session_before_tree");
		expect(hooks).toContain("before_provider_request");
		expect(commands).toContain("lang");
		expect(tools).toEqual(expect.arrayContaining(["read", "bash", "edit", "write", "i18n_get_locale"]));
		expect(eventHandlers).toContain("pi-i18n/requestApi");
		expect(eventHandlers).toContain("pi-core/i18n/requestApi");
	});
});
