import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const roots: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("localized bash settings", () => {
	it.skipIf(process.platform === "win32")("uses the host's effective settings API when available and refreshes its values", async () => {
		vi.resetModules();
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-di18n-bash-runtime-")));
		roots.push(root);
		vi.stubEnv("PI_CODING_AGENT_DIR", root);
		const customShell = join(root, "custom-bash");
		writeFileSync(customShell, '#!/bin/sh\nexport PI_DI18N_SHELL_MARKER=runtime-shell\nexec /bin/bash "$@"\n');
		chmodSync(customShell, 0o755);
		writeFileSync(join(root, "settings.json"), JSON.stringify({ shellCommandPrefix: "export PI_DI18N_PREFIX=saved-prefix" }));
		let prefix = "runtime-prefix";
		const { installLocalizedToolsOnce } = await import("../src/pi-ui.ts");
		let bash: any;
		installLocalizedToolsOnce({
			events: { on() {} },
			getSettings: () => ({ shellPath: customShell, shellCommandPrefix: `export PI_DI18N_PREFIX=${prefix}` }),
			registerTool: (tool: any) => { if (tool.name === "bash") bash = tool; },
		} as any, { t: (key: string) => key } as any);
		const execute = async () => {
			const result = await bash.execute("call", { command: 'printf "%s|%s" "$PI_DI18N_SHELL_MARKER" "$PI_DI18N_PREFIX"' }, undefined, undefined, { cwd: root, isProjectTrusted: () => false });
			return result.content[0].text;
		};
		expect(await execute()).toBe("runtime-shell|runtime-prefix");
		prefix = "updated-runtime-prefix";
		expect(await execute()).toBe("runtime-shell|updated-runtime-prefix");
	});

	it.skipIf(process.platform === "win32")("executes through saved shell settings, follows cwd and trust, and refreshes between calls", async () => {
		vi.resetModules();
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-di18n-bash-")));
		roots.push(root);
		const agentDir = join(root, "agent");
		const firstCwd = join(root, "first");
		const secondCwd = join(root, "second");
		for (const dir of [agentDir, firstCwd, secondCwd]) mkdirSync(dir);
		const customShell = join(root, "custom-bash");
		writeFileSync(customShell, '#!/bin/sh\nexport PI_DI18N_SHELL_MARKER=custom-shell\nexec /bin/bash "$@"\n');
		chmodSync(customShell, 0o755);
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ shellPath: customShell, shellCommandPrefix: "export PI_DI18N_PREFIX=global-prefix" }));
		mkdirSync(join(firstCwd, ".pi"));
		writeFileSync(join(firstCwd, ".pi", "settings.json"), JSON.stringify({ shellCommandPrefix: "export PI_DI18N_PREFIX=project-prefix" }));
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
		const { installLocalizedToolsOnce } = await import("../src/pi-ui.ts");
		let bash: any;
		installLocalizedToolsOnce({ events: { on() {} }, registerTool: (tool: any) => { if (tool.name === "bash") bash = tool; } } as any, { t: (key: string) => key } as any);
		const execute = async (cwd: string, trusted: boolean) => {
			const result = await bash.execute("call", { command: 'printf "%s|%s|%s" "$PI_DI18N_SHELL_MARKER" "$PI_DI18N_PREFIX" "$PWD"' }, undefined, undefined, { cwd, isProjectTrusted: () => trusted });
			return result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
		};
		expect(await execute(firstCwd, true)).toBe(`custom-shell|project-prefix|${firstCwd}`);
		expect(await execute(firstCwd, false)).toBe(`custom-shell|global-prefix|${firstCwd}`);
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ shellPath: customShell, shellCommandPrefix: "export PI_DI18N_PREFIX=updated-prefix" }));
		expect(await execute(secondCwd, true)).toBe(`custom-shell|updated-prefix|${secondCwd}`);
	});
});
