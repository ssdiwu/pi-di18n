import { describe, expect, it } from "vitest";
import { applyLocalizedFooter } from "../src/pi-ui.ts";
import type { I18nApi } from "../src/types.ts";

function makeI18n(locale: string): I18nApi {
	return {
		getLocale: () => locale,
		setLocale: () => {},
		getFallbackLocale: () => "en",
		setFallbackLocale: () => {},
		registerBundle: () => ({ ok: true, errors: [] }),
		t: (k: string) => k,
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

		applyLocalizedFooter({} as any, ctx, makeI18n("zh-CN"));

		expect(footerCalled).toBe(false);
		expect(notice).toBe("lang:简体");
	});
});
