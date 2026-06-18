import { describe, expect, it } from "vitest";
import { applyLocalizedFooter, notifyLanguageThinkStatus } from "../src/pi-ui.ts";
import type { I18nApi } from "../src/types.ts";

function makeI18n(locale: string): I18nApi {
	return {
		getLocale: () => locale,
		setLocale: () => {},
		getFallbackLocale: () => "en",
		setFallbackLocale: () => {},
		registerBundle: () => ({ ok: true, errors: [] }),
		t: (k: string, vars?: Record<string, string>) => {
			if (k === "pi.ui.footer.startup.thinkOn") {
				if (locale === "zh-TW") return `lang:${vars?.locale}（think:已開啟，跟隨 /lang）`;
				return `lang:${vars?.locale}（think:开启，跟随 /lang）`;
			}
			if (k === "pi.ui.footer.startup.thinkOff") {
				if (locale === "zh-TW") return `lang:${vars?.locale}（think:已關閉）`;
				return `lang:${vars?.locale}（think:关闭）`;
			}
			return k;
		},
		onLocaleChanged: () => () => {},
		doctor: () => ({ issues: [] }),
		listNamespaces: () => [],
	} as unknown as I18nApi;
}

describe("localized footer behavior", () => {
	it("does not override pi native footer/status bar", () => {
		let footerCalled = false;
		let notice = "";
		const ctx = {
			hasUI: true,
			ui: {
				setFooter: () => {
					footerCalled = true;
				},
				notify: (message: string) => {
					notice = message;
				},
			},
		};

		applyLocalizedFooter({} as any, ctx, makeI18n("zh-CN"), { thinkEnabled: true });

		expect(footerCalled).toBe(false);
		expect(notice).toBe("lang:简体（think:开启，跟随 /lang）");
	});

	it("shows think disabled state in startup notice", () => {
		let notice = "";
		const ctx = {
			hasUI: true,
			ui: {
				setFooter: () => {},
				notify: (message: string) => {
					notice = message;
				},
			},
		};

		applyLocalizedFooter({} as any, ctx, makeI18n("zh-CN"), { thinkEnabled: false });
		expect(notice).toBe("lang:简体（think:关闭）");
	});

	it("uses localized zh-TW startup notice wording", () => {
		let notice = "";
		const ctx = {
			hasUI: true,
			ui: {
				setFooter: () => {},
				notify: (message: string) => {
					notice = message;
				},
			},
		};

		applyLocalizedFooter({} as any, ctx, makeI18n("zh-TW"), { thinkEnabled: true });
		expect(notice).toBe("lang:繁體（think:已開啟，跟隨 /lang）");
	});

	it("can re-notify current language/think status after toggle", () => {
		const notices: string[] = [];
		const ctx = {
			hasUI: true,
			ui: {
				notify: (message: string) => {
					notices.push(message);
				},
			},
		};

		notifyLanguageThinkStatus(ctx, makeI18n("zh-CN"), true);
		expect(notices.at(-1)).toBe("lang:简体（think:开启，跟随 /lang）");
	});
});
