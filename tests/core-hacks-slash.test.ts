import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { I18nRegistry } from "../src/registry.ts";
import { getSlashDescMode, installCoreHacks, tSlashDescForTest, translateUiLineForTest, uninstallCoreHacks } from "../src/core-hacks.ts";
import { putCachedCommandDescription, setActiveUiCache, type UiCache } from "../src/ui-localize/cache.js";
import { BUILTIN_SLASH_COMMANDS } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/slash-commands.js";

function loadBundle(locale: string) {
	const path = join(process.cwd(), "locales", `${locale}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

describe("core-hacks slash command patch", () => {
	it("localizes tagged autocomplete descriptions via the runtime cache (regression: source-tag prefix)", () => {
		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		// pi 0.83 prefixes autocomplete descriptions with a source tag (e.g. "[u:npm:pi-btw]"),
		// while the runtime cache stores the bare description. The lookup must strip the tag
		// before comparing and re-prefix it after a hit, or the strict `en === currentEn` check
		// always misses and third-party command descriptions never get localized.
		const cache: UiCache = { locales: {} };
		putCachedCommandDescription(cache, "zh-CN", "command:btw", "Continue a side conversation in a focused BTW modal.", "在聚焦的 BTW 模态窗口中继续一段支线对话。");
		putCachedCommandDescription(cache, "zh-CN", "command:skill:grilling", "Grill the user relentlessly about a plan.", "毫不留情地拷问用户的想法。");
		setActiveUiCache(cache);

		expect(
			tSlashDescForTest(i18n as any, {
				name: "btw",
				description: "[u:npm:pi-btw] Continue a side conversation in a focused BTW modal.",
			}),
		).toBe("[u:npm:pi-btw] 在聚焦的 BTW 模态窗口中继续一段支线对话。");

		// generic tag
		expect(
			tSlashDescForTest(i18n as any, {
				name: "skill:grilling",
				description: "[u] Grill the user relentlessly about a plan.",
			}),
		).toBe("[u] 毫不留情地拷问用户的想法。");

		// untagged descriptions keep working (no regression)
		expect(
			tSlashDescForTest(i18n as any, {
				name: "btw",
				description: "Continue a side conversation in a focused BTW modal.",
			}),
		).toBe("在聚焦的 BTW 模态窗口中继续一段支线对话。");

		// unknown command falls through untouched
		expect(
			tSlashDescForTest(i18n as any, {
				name: "does-not-exist",
				description: "[u] Some unknown command description",
			}),
		).toBe("[u] Some unknown command description");

		setActiveUiCache({ locales: {} });
	});

	it("translates zh-CN model selector lines without leaving mixed English/Chinese fragments", () => {
		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		expect(translateUiLineForTest(i18n as any, "Scope: all | scoped")).toBe("范围：全部 | 已筛选");
		expect(translateUiLineForTest(i18n as any, "tab scope (all/scoped)")).toBe("tab 范围（全部/已筛选）");
		expect(translateUiLineForTest(i18n as any, "  Model Name: glm-5.2")).toBe("  模型：glm-5.2");
		expect(
			translateUiLineForTest(
				i18n as any,
				"\u001b[38;2;102;102;102mtab\u001b[39m\u001b[38;2;128;128;128m scope\u001b[39m\u001b[38;2;128;128;128m (all/scoped)\u001b[39m",
			),
		).toBe("tab 范围（全/筛）");
		expect(
			translateUiLineForTest(
				i18n as any,
				"\u001b[38;2;128;128;128m  Model 名称： glm-5.2\u001b[39m",
			),
		).toBe("  模型：glm-5.2");
		expect(translateUiLineForTest(i18n as any, "Only showing models with configured API keys (see README for details)")).toBe("仅显示已配置 API 密钥的模型（详见 README）");
		expect(translateUiLineForTest(i18n as any, "Default project trust")).toBe("默认项目可信策略");
		expect(translateUiLineForTest(i18n as any, "Warnings")).toBe("警告");
		expect(translateUiLineForTest(i18n as any, "Enable or disable individual warnings")).toBe("启用或禁用单项警告");
		expect(translateUiLineForTest(i18n as any, "Default project trust Ask")).toBe("  默认项目可信策略 问");
		expect(translateUiLineForTest(i18n as any, "  编辑器内距          0")).toBe("  编辑器内距 0");
		expect(translateUiLineForTest(i18n as any, "  自动压缩            true")).toBe("  自动压缩 开");
		expect(translateUiLineForTest(i18n as any, "Warnings configure")).toBe("  警告 配置");
		expect(translateUiLineForTest(i18n as any, "双击 Esc 动作 tree")).toBe("  双击 Esc 动作 会话树");
		expect(translateUiLineForTest(i18n as any, "  双击 Esc 动作       tree")).toBe("  双击 Esc 动作 会话树");
		expect(translateUiLineForTest(i18n as any, "树状筛选模式 default")).toBe("  树状筛选模式 默认");
		expect(translateUiLineForTest(i18n as any, "思考等级 high")).toBe("  思考等级 高");
		expect(translateUiLineForTest(i18n as any, "主题 light/dark")).toBe("  主题 明/暗");
		expect(translateUiLineForTest(i18n as any, "  Session Tree")).toBe("  会话树");
		expect(translateUiLineForTest(i18n as any, "Type to search:")).toBe("输入以搜索：");
		expect(translateUiLineForTest(i18n as any, "  No entries found")).toBe("  未找到条目");
		expect(translateUiLineForTest(i18n as any, "  ↑/↓ move · ←/→ page · ctrl+←/→ branch · shift+l label · shift+t label time")).toBe("  ↑/↓ 移动 · ←/→ 翻页 · ctrl+←/→ 分支 · shift+l 标签 · shift+t 标签时间");
		expect(translateUiLineForTest(i18n as any, "  filters ctrl+d/t/u/l/a · cycle ctrl+o/shift+ctrl+o")).toBe("  筛选 ctrl+d/t/u/l/a · 循环 ctrl+o/shift+ctrl+o");
		expect(translateUiLineForTest(i18n as any, "Select authentication method:")).toBe("选择认证方式：");
		expect(translateUiLineForTest(i18n as any, "Use a subscription")).toBe("使用订阅");
		expect(translateUiLineForTest(i18n as any, "Use an API key")).toBe("使用 API 密钥");
		expect(translateUiLineForTest(i18n as any, "enter select")).toBe("enter 选择");
		expect(translateUiLineForTest(i18n as any, "↑↓ navigate  enter select  escape/ctrl+c cancel")).toBe("↑↓ 导航  enter 选择  escape/ctrl+c 取消");
		expect(translateUiLineForTest(i18n as any, "  ↑↓ navigate  enter select  escape/ctrl+c cancel")).toBe("  ↑↓ 导航  enter 选择  escape/ctrl+c 取消");
		expect(translateUiLineForTest(i18n as any, "Select provider to configure:")).toBe("选择要配置的提供商：");
		expect(translateUiLineForTest(i18n as any, "Select provider to logout:")).toBe("选择要登出的提供商：");
		expect(translateUiLineForTest(i18n as any, "No providers available")).toBe("没有可用的提供商");
		expect(translateUiLineForTest(i18n as any, "No matching providers")).toBe("没有匹配的提供商");
		expect(translateUiLineForTest(i18n as any, " ✓ configured")).toBe(" ✓ 已配置");
		expect(translateUiLineForTest(i18n as any, " • unconfigured")).toBe(" • 未配置");
		expect(translateUiLineForTest(i18n as any, "Error: Failed to export session: Nothing to export yet - start a conversation first")).toBe("错误：导出会话失败：还没有可导出的会话，请先开始对话");
		expect(translateUiLineForTest(i18n as any, "Error: Usage: /import <path.jsonl>")).toBe("错误：用法：/import <path.jsonl>");
		expect(translateUiLineForTest(i18n as any, "Error: No agent messages to copy yet.")).toBe("错误：还没有可复制的 agent 消息。");
		expect(translateUiLineForTest(i18n as any, "Warning: Usage: /name <name>")).toBe("警告：用法：/name <name>");
		expect(translateUiLineForTest(i18n as any, " tab scope · re:<pattern> regex · \"phrase\" exact")).toBe(" tab 范围 · re:<模式> 正则 · \"短语\" 精确");
		expect(translateUiLineForTest(i18n as any, "tab scope · re:<模式> 正则 · \"短语\" 精确")).toBe("tab 范围 · re:<模式> 正则 · \"短语\" 精确");
		expect(translateUiLineForTest(i18n as any, " ctrl+s sort · ctrl+n named · ctrl+d delete · ctrl+p path (off) · ctrl+r rename")).toBe(" ctrl+s 排序 · ctrl+n 命名 · ctrl+d 删除 · ctrl+p 路径（关） · ctrl+r 重命名");
		expect(translateUiLineForTest(i18n as any, "  ↑↓ navigate  enter save  escape/ctrl+c cancel")).toBe("  ↑↓ 导航  enter 保存  escape/ctrl+c 取消");
		expect(translateUiLineForTest(i18n as any, "Resume Session (Current Folder)")).toBe("恢复会话（当前文件夹）");
		expect(translateUiLineForTest(i18n as any, "No sessions in current folder. Press Tab to view all.")).toBe("当前文件夹中没有会话。按 Tab 查看全部。");
	});

	it("translates Pi 0.80 session cache breakdown without mixed English labels", () => {
		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		const sessionReport = [
			"Session Info",
			"Messages",
			"Total: 138",
			"User: 4",
			"Assistant: 61",
			"Tools: 73 calls, 73 results",
			"Tokens",
			"Input: 3,985,016",
			"  Cached: 3,821,056 (95.9%)",
			"  Uncached: 163,960 (46,652 written to cache)",
			"Output: 20,461",
			"Total: 4,005,477",
			"Cost",
			"Total: $1.672",
			"Cache Re-billed: $0.105 (46,652 tokens, 1 miss)",
		].join("\n");

		expect(translateUiLineForTest(i18n as any, sessionReport)).toBe([
			"会话信息",
			"消息",
			"总计： 138",
			"用户： 4",
			"助手： 61",
			"工具： 73 次调用，73 个结果",
			"令牌",
			"输入： 3,985,016",
			"  已缓存： 3,821,056 (95.9%)",
			"  未缓存： 163,960 (46,652 已写入缓存)",
			"输出： 20,461",
			"总计： 4,005,477",
			"费用",
			"总计： $1.672",
			"缓存重计费： $0.105 (46,652 令牌，1 次未命中)",
		].join("\n"));
		expect(translateUiLineForTest(i18n as any, "partial results or timeout errors")).toBe("partial results or timeout errors");
		expect(translateUiLineForTest(i18n as any, "Reloaded keybindings, extensions, skills, prompts, themes, and context files")).toBe("已重新加载：按键绑定、扩展、技能、提示词、主题和上下文文件");
	});

	it("keeps the Pi 0.80 session cache breakdown localized for zh-TW", () => {
		const i18n = new I18nRegistry({ locale: "zh-TW", fallbackLocale: "en" });
		const line = "Tools: 73 calls, 73 results\nTokens\n  Cached: 3,821,056 (95.9%)\nCache Re-billed: $0.105 (46,652 tokens, 1 miss)";
		expect(translateUiLineForTest(i18n as any, line)).toBe("工具：73 次呼叫，73 個結果\n令牌\n  已快取：3,821,056 (95.9%)\n快取重新計費：$0.105 (46,652 令牌，1 次未命中)");
	});

	it("patches pi 0.79 builtin slash descriptions for zh-CN and reports primary mode", async () => {
		const piDistCli = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
		if (!process.argv.includes(piDistCli)) process.argv.unshift(piDistCli);

		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		const compact = BUILTIN_SLASH_COMMANDS.find((cmd) => cmd.name === "compact");
		const originalCompactDescription = compact?.description;

		const res = await installCoreHacks(i18n);
		expect(res.ok).toBe(true);
		expect(getSlashDescMode().mode).toBe("primary");
		expect(compact?.description).toBe("手动压缩会话上下文");

		await uninstallCoreHacks();
		expect(compact?.description).toBe(originalCompactDescription);
	});

	it("reports primary mode on repeated installCoreHacks in the same locale (reload scenario)", async () => {
		const piDistCli = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
		if (!process.argv.includes(piDistCli)) process.argv.unshift(piDistCli);

		await uninstallCoreHacks(); // clean start

		const i18n = new I18nRegistry({ locale: "zh-CN", fallbackLocale: "en" });
		expect(i18n.registerBundle(loadBundle("en")).ok).toBe(true);
		expect(i18n.registerBundle(loadBundle("zh-CN")).ok).toBe(true);

		const compact = BUILTIN_SLASH_COMMANDS.find((cmd) => cmd.name === "compact");

		// First install: cold start — stores English originals, translates to zh-CN.
		const first = await installCoreHacks(i18n);
		expect(first.ok).toBe(true);
		expect(getSlashDescMode().mode).toBe("primary");
		expect(compact?.description).toBe("手动压缩会话上下文");

		// Second install: same-process reload (e.g. /lang picked same locale, /reload).
		// cmd.description is already zh-CN; state.original still holds the English
		// original. Idempotent re-translation must remain primary, NOT fallback.
		const second = await installCoreHacks(i18n);
		expect(second.ok).toBe(true);
		expect(getSlashDescMode().mode).toBe("primary");
		expect(compact?.description).toBe("手动压缩会话上下文");

		await uninstallCoreHacks();
	});
});
