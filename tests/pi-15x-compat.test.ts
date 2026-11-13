import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { getSlashDescMode, installCoreHacks, translateUiLineForTest, uninstallCoreHacks } from "../src/core-hacks.ts";

// pi 1.5.2 compatibility: bundle layout keeps BUILTIN_SLASH_COMMANDS internal,
// selector hint lines come from pi-tui Text components, and /thinking + /bug
// replaced /llama. These tests pin the fixes so the next Pi upgrade cannot
// silently regress them.

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

function makeI18n() {
	const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
	expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
	expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);
	return i18n;
}

describe("pi 1.5.x compatibility", () => {
	it("reaches pi.slash.<name>.description through t() without legacy slash.* alias keys", () => {
		const i18n = makeI18n();
		// pi 1.5.2 builtin command set: /llama removed, /thinking and /bug added.
		for (const name of ["settings", "model", "tree", "thinking", "scoped-models", "bug", "trust", "quit"]) {
			const key = `pi.slash.${name}.description`;
			const translated = i18n.t(key);
			expect(translated, `${key} must resolve`).not.toBe(key);
		}
		expect(i18n.t("pi.slash.thinking.description")).toContain("设置思考等级");
		expect(i18n.t("pi.slash.bug.description")).toContain("报告缺陷");
		// The removed command must not come back through any alias path.
		expect(i18n.t("pi.slash.llama.description")).toBe("pi.slash.llama.description");
		expect(i18n.doctor().issues).toHaveLength(0);
	});

	it("localizes selector hint lines produced by pi-tui Text components", () => {
		const i18n = makeI18n();
		expect(translateUiLineForTest(i18n as any, "Enter to select · Esc to go back")).toBe("Enter 选择 · Esc 返回");
		expect(translateUiLineForTest(i18n as any, "Type to filter · Enter to select · Esc to go back")).toBe(
			"输入筛选 · Enter 选择 · Esc 返回",
		);
		expect(
			translateUiLineForTest(i18n as any, "Enter to select · Ctrl+S to set as default · Escape/Ctrl+C to cancel"),
		).toBe("Enter 选择 · Ctrl+S 设为默认 · Esc/Ctrl+C 取消");
		expect(translateUiLineForTest(i18n as any, "Enter/Space to change")).toBe("Enter/Space 更改");
		expect(translateUiLineForTest(i18n as any, "Esc to cancel")).toBe("Esc 取消");
	});

	it("installs a primary slash-description patch against the pi 1.5.2 bundle layout", async () => {
		const piDistCli = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
		if (!process.argv.includes(piDistCli)) process.argv.unshift(piDistCli);

		await uninstallCoreHacks(); // clean start
		const i18n = makeI18n();

		const res = await installCoreHacks(i18n);
		expect(res.ok).toBe(true);
		// Bundle layout has no exported BUILTIN_SLASH_COMMANDS; the patched
		// setupAutocompleteProvider path must still count as primary.
		expect(getSlashDescMode().mode).toBe("primary");

		await uninstallCoreHacks();
	});
});

describe("zh-CN UI dictionary coverage", () => {
	it("translates the pi 1.5.2 settings row labels, descriptions and enum values", () => {
		const i18n = makeI18n();
		const cases: [string, string][] = [
			["Cache warming", "缓存预热"],
			["Session share destination", "会话分享目的地"],
			["Mermaid diagrams", "Mermaid 图表"],
			["Interface layout; regular mode uses the terminal's normal scrollback", "界面布局；常规模式使用终端自身的回滚缓冲"],
			["none", "无"],
			["transcript", "完整记录"],
			["auto", "自动"],
			["regular", "常规"],
			["fullscreen", "全屏"],
			["always", "始终"],
			["true", "开"],
			["false", "关"],
		];
		for (const [from, to] of cases) {
			expect(translateUiLineForTest(i18n as any, from), from).toBe(to);
		}
	});

	it("keeps long sentences intact when enum values are translated", () => {
		const i18n = makeI18n();
		expect(translateUiLineForTest(i18n as any, "Scrollbar behavior in fullscreen mode; has no effect in regular mode")).toBe(
			"全屏模式下的滚动条行为；常规模式不生效",
		);
		expect(
			translateUiLineForTest(
				i18n as any,
				"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
			),
		).toBe("流式传输时按 Enter 会将引导消息排队。'one-at-a-time'：一次发送一条并等待响应。'all'：一次发送全部。");
	});

	it("covers the /hotkeys markdown table rows", () => {
		const i18n = makeI18n();
		const md = "| Ctrl+X | Copy selection or last assistant message |";
		expect(translateUiLineForTest(i18n as any, md)).toContain("复制所选内容或上一条助手消息");
		expect(translateUiLineForTest(i18n as any, "Move cursor / browse history")).toBe("移动光标 / 浏览历史");
	});
});
