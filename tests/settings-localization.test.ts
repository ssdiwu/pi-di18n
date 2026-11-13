import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.PI_DI18N_STATE_DIR = "/dev/null"; });
import { translateUiLineForTest } from "../src/core-hacks.ts";

const PACK_DIR = join(process.cwd(), "src/core-hacks-locales");
// Both legacy and current wording remain supported in maintained language packs.
// zh-TW.json (0.2.2) mirrors zh-CN keys but keeps the legacy wording via the zh-TW legacy table.
const LEGACY_SETTINGS = [
	"Show transcript notices for significant prompt-cache misses",
	"Horizontal padding for user messages, assistant messages, and thinking",
] as const;
const SHARED_SETTINGS = ["Cache miss notices", "Output padding"] as const;
// pi 1.1.0 wording: zh-CN first; other packs pending backfill.
const SETTINGS_1_1 = [
	"Show transcript notices for cache costs and provider recovery diagnostics",
	"Horizontal padding for messages, tool output, and command output",
] as const;

function api(locale: string) {
	return { getLocale: () => locale } as any;
}

describe("pi 0.79 new settings localization", () => {
	it("keeps every maintained non-English pack complete", () => {
		const files = readdirSync(PACK_DIR).filter((file) => file.endsWith(".json") && file !== "en.json").sort();
		expect(files).toEqual(["de.json", "es.json", "fr.json", "ja.json", "ko.json", "pt-BR.json", "zh-CN.json", "zh-TW.json"]);

		for (const file of files) {
			const pack = JSON.parse(readFileSync(join(PACK_DIR, file), "utf8"));
			const settings = file === "zh-CN.json" ? [...SHARED_SETTINGS, ...LEGACY_SETTINGS, ...SETTINGS_1_1] : [...SHARED_SETTINGS, ...LEGACY_SETTINGS];
			for (const source of settings) {
				expect(pack.exact[source], `${file}: ${source}`).toBeTypeOf("string");
				expect(pack.exact[source], `${file}: ${source}`).not.toBe(source);
			}
		}
	});

	it.each([
		["Show transcript notices for significant prompt-cache misses", "提示缓存明显未命中时显示记录提示"],
		["Horizontal padding for user messages, assistant messages, and thinking", "用户消息、助手消息和思考内容的水平内距"],
	])("keeps supported Pi 0.83 wording localized: %s", (source, translated) => {
		expect(translateUiLineForTest(api("zh-CN"), source)).toBe(translated);
	});

	it("translates zh-CN setting descriptions and selected values", () => {
		const zhCN = api("zh-CN");

	expect(translateUiLineForTest(zhCN, "Show transcript notices for cache costs and provider recovery diagnostics")).toBe(
		"显示缓存成本与提供商恢复诊断的记录提示",
	);
	expect(translateUiLineForTest(zhCN, "Horizontal padding for messages, tool output, and command output")).toBe(
		"消息、工具输出和命令输出的水平内距",
	);
		expect(translateUiLineForTest(zhCN, "→ Cache miss notices false")).toBe("→ 缓存未命中提示 关");
		expect(translateUiLineForTest(zhCN, "→ Cache miss notices true")).toBe("→ 缓存未命中提示 开");
		expect(translateUiLineForTest(zhCN, "  Output padding 1")).toBe("  输出内距 1");
	});

	it("keeps zh-TW legacy localization complete", () => {
		const zhTW = api("zh-TW");

		expect(translateUiLineForTest(zhTW, "Cache miss notices")).toBe("快取未命中通知");
		expect(translateUiLineForTest(zhTW, "Show transcript notices for significant prompt-cache misses")).toBe(
			"顯示重大提示快取未命中的記錄通知",
		);
		expect(translateUiLineForTest(zhTW, "Output padding")).toBe("輸出內距");
		expect(translateUiLineForTest(zhTW, "Horizontal padding for user messages, assistant messages, and thinking")).toBe(
			"使用者訊息、助理訊息與思考的水平內距",
		);
	});

	// Pi 真实链路：activateItem() 用 values.indexOf(currentValue) 循环切换、
	// 子菜单用值相等预选，因此 currentValue 必须始终保留英文原始值；翻译只
	// 发生在 renderMainList 渲染期间（渲染后还原）。否则首次切换会从中文
	// 跳回第一项（截图问题：切换后 TUI 模式值从「全屏」变回英文 fullscreen）。
	it("renders enum values localized while keeping the stored value verbatim", async () => {
		const { patchSettingsListForTest } = await import("../src/core-hacks.ts");
		const zhCN = api("zh-CN");

		// 模拟 Pi SettingsList 的最小行为（含原始 activateItem 的 indexOf 循环）。
		class MockSettingsList {
			items = [
				{ id: "tui-mode", label: "TUI mode", currentValue: "fullscreen", values: ["regular", "fullscreen"] },
				{ id: "warnings", label: "Warnings", currentValue: "configure", submenu: () => ({}) },
				];
			renderMainList(width: number) {
				return this.items.map((i: any) => `${i.label} ${i.currentValue}`.padEnd(width));
			}
			activateItem() {
				const item = this.items[0];
				const next = item.values[(item.values.indexOf(item.currentValue) + 1) % item.values.length];
				item.currentValue = next;
			}
		}
		const list: any = new MockSettingsList();
		patchSettingsListForTest(list, zhCN);
		const lines = list.renderMainList(80);
		expect(lines[0]).toContain("TUI 模式");
		expect(lines[0]).toContain("全屏");
		expect(list.items[0].currentValue).toBe("fullscreen"); // 渲染后还原

		// 译文比原文宽的枚举值不能被宽度保护截断（all → 全…）：值不是预宽行，
		// 上游渲染会自己按剩余宽度截断，这里不该提前限宽。
		list.items[0].currentValue = "all";
		const wide = list.renderMainList(80);
		expect(wide[0]).toContain("全部");
		expect(wide[0]).not.toContain("…");
		expect(list.items[0].currentValue).toBe("all");

		list.activateItem(); // Enter 循环切换：indexOf 依赖原始值
		expect(list.items[0].currentValue).toBe("regular");
		const after = list.renderMainList(80);
		expect(after[0]).toContain("常规");
		expect(list.items[0].currentValue).toBe("regular");

		// 子菜单预选同样依赖原始值相等。
		expect(list.items[1].currentValue).toBe("configure");
		expect(typeof list.items[1].submenu()).toBe("object");
	});
});
