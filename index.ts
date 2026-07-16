import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, keyHint } from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text } from "@earendil-works/pi-tui";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { detectLocaleFromEnv, loadI18nConfig, saveUserI18nConfig, type I18nConfig } from "./src/config";
import { I18nRegistry } from "./src/registry";
import type { BundleV1, I18nApi } from "./src/types";
import { applyLocalizedFooter, applyLocalizedHeader, installLocalizedToolsOnce, notifyLanguageThinkStatus } from "./src/pi-ui";
import {
	getCoreDistDebug,
	getCoreProbeDebug,
	getSlashDescMode,
	installCoreHacks,
	resetCoreProbe,
	setCoreProbeEnabled,
	shouldWarnCoreMisalignment,
	uninstallCoreHacks,
	verifyZhTwCoreHackParity,
} from "./src/core-hacks";
import { summarizeForCompaction, summarizeForTree } from "./src/compaction/summarize";
import { prefetchOnSessionStart, applyOnProviderRequest, commandThink, getThinkDebug } from "./src/think/localize";
import { isEnabled as isThinkEnabled, loadCache as loadThinkCache } from "./src/think/cache";
import { loadUiCache, setActiveUiCache, getUiDebug } from "./src/ui-localize/cache";
import { prefetchUiDescriptionsOnSessionStart } from "./src/ui-localize/localize";

function loadBundle(baseDir: string, rel: string): BundleV1 {
	const path = join(baseDir, rel);
	const raw = readFileSync(path, "utf-8");
	return JSON.parse(raw) as BundleV1;
}

export default function i18nExtension(pi: ExtensionAPI): void {
	const baseDir = dirname(fileURLToPath(import.meta.url));

	// 1) Bootstrap locale from config/env. Actual cwd is only known at session_start,
	// so we finalize in session_start.
	const i18n = new I18nRegistry({ locale: "en", fallbackLocale: "en" });

	// B 线（思考语言本地化）缓存：开关状态 + 运行时翻译缓存。默认关（ADR 0002）。
	const thinkCache = loadThinkCache();
	// A 线 runtime UI description 缓存：扩展/技能/提示词命令说明，默认不阻塞 UI。
	const uiCache = loadUiCache();
	setActiveUiCache(uiCache);

	// Load all shipped locale bundles from ./locales/*.json
	// Track which locales are shipped for the pi namespace so /lang picker can list them.
	const shippedPiLocales = new Set<string>();
	try {
		const localeDir = join(baseDir, "locales");
		const files = readdirSync(localeDir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
		for (const f of files) {
			try {
				const bundle = loadBundle(baseDir, `locales/${f}`);
				i18n.registerBundle(bundle);
				if (bundle?.namespace === "pi" && typeof bundle?.locale === "string") {
					shippedPiLocales.add(canonicalizeLocaleTag(bundle.locale));
				}
			} catch {
				// ignore invalid bundle
			}
		}
	} catch {
		// ignore
	}

	// 2) Event-bus compliance bridge
	pi.events.on("pi-i18n/requestApi", (payload: any) => {
		try {
			payload?.reply?.(i18n as unknown as I18nApi);
		} catch {
			// ignore
		}
	});

	pi.events.on("pi-i18n/registerBundle", (bundle: any) => {
		const res = i18n.registerBundle(bundle as BundleV1);
		if (!res.ok) {
			pi.events.emit("pi-i18n/bundleRejected", {
				namespace: bundle?.namespace,
				locale: bundle?.locale,
				errors: res.errors,
			});
		}
	});

	// Upstream-aligned capability surface (same API, no separate bridge contract).
	const i18nCapabilities = {
		contractVersion: 1,
		capability: "pi.i18n.v1",
		provider: "pi-di18n",
		apiVersion: "1.x",
		detection: {
			requestEvent: "pi-core/i18n/requestApi",
			registerBundleEvent: "pi-core/i18n/registerBundle",
		},
	};

	pi.events.on("pi-core/i18n/requestApi", (payload: any) => {
		try {
			payload?.reply?.(i18n as unknown as I18nApi, i18nCapabilities);
		} catch {
			// ignore
		}
	});

	pi.events.on("pi-core/i18n/registerBundle", (bundle: any) => {
		const res = i18n.registerBundle(bundle as BundleV1);
		if (!res.ok) {
			pi.events.emit("pi-core/i18n/bundleRejected", {
				namespace: bundle?.namespace,
				locale: bundle?.locale,
				errors: res.errors,
			});
		}
	});

	// 3) Persisted + env locale selection
	let runtimeConfig: I18nConfig = {};
	let localeSource: "command" | "project" | "user" | "environment" | "default" = "default";
	const applyLocaleForCwd = (cwd: string, ctxUi?: { notify?: (m: string, t?: any) => void; setHiddenThinkingLabel?: (s?: string) => void }) => {
		const prevLocale = i18n.getLocale();
		const loaded = loadI18nConfig(cwd);
		runtimeConfig = loaded.config ?? {};
		const envLocale = detectLocaleFromEnv();
		localeSource = loaded.config.locale ? (loaded.source === "project" ? "project" : "user") : envLocale ? "environment" : "default";
		let chosen = loaded.config.locale ?? envLocale ?? "en";
		// Normalize common environment locale en-SG to our compact locale tag "sg".
		try {
			const canon = canonicalizeLocaleTag(chosen);
			if (canon === "en-SG") chosen = "sg";
		} catch {
			// ignore
		}
		i18n.setFallbackLocale(loaded.config.fallbackLocale ?? "en");
		i18n.setLocale(chosen);
		ctxUi?.setHiddenThinkingLabel?.(i18n.getLocale().startsWith("zh") ? "（思考已隱藏）" : "(thinking hidden)");
		pi.events.emit("pi-i18n/localeChanged", { locale: i18n.getLocale(), prevLocale, source: "startup" });
	};

	// Header chrome is disabled by policy for this extension runtime.
	const shouldApplyHeaderOnStartup = () => false;

	// Install tool overrides once (behavior preserved, rendering localized)
	// Must be registered before the first session_start fires.
	installLocalizedToolsOnce(pi, i18n as unknown as I18nApi);

	pi.on("session_start", async (_event, ctx) => {
		applyLocaleForCwd(ctx.cwd, ctx.ui);
		setCoreProbeEnabled(runtimeConfig.probeEnabled !== false);
		pi.events.emit("pi-i18n/capabilities", i18nCapabilities);
		pi.events.emit("pi-core/i18n/capabilities", i18nCapabilities);

		// Best-effort core UI hacks (no core changes). Auto-on by default.
		// Safe scope: core status/warn/error + selector UIs (session/model) + slash command descriptions.
		if (runtimeConfig.coreHacksEnabled !== false) {
			await installCoreHacks(i18n as unknown as I18nApi);
		} else {
			await uninstallCoreHacks();
		}
		const warnCoreMismatch = shouldWarnCoreMisalignment(i18n as unknown as I18nApi);
		if (warnCoreMismatch) {
			ctx.ui?.notify?.("i18n: slash command localization is running in fallback mode (pi-core alignment needed)", "warning");
		}

		// Apply chrome now
		// Failsafe: force-clear header renderer so localized banner never appears.
		try {
			ctx.ui?.setHeader?.(() => ({ invalidate() {}, render() { return []; } }));
		} catch {
			// ignore
		}
		if (shouldApplyHeaderOnStartup()) {
			applyLocalizedHeader(pi, ctx, i18n as unknown as I18nApi, { warnCoreMismatch });
		}
		applyLocalizedFooter(pi, ctx, i18n as unknown as I18nApi, { thinkEnabled: isThinkEnabled(thinkCache) });

		// A 线：异步预翻译 runtime command descriptions（不阻塞 session_start）。
		prefetchUiDescriptionsOnSessionStart(pi, ctx, i18n as unknown as I18nApi, uiCache);
		// B 线：异步预翻译 tool/param description（不阻塞 session_start）。传 ctx 拿 model。
		prefetchOnSessionStart(pi, ctx, i18n as unknown as I18nApi, thinkCache);

		// warn if RTL selected
		if ((i18n as any).isRtlSelected?.()) {
			ctx.ui.notify(i18n.t("pi.language.rtlWarning", { locale: i18n.getLocale() }), "warning");
		}
	});

	// 4) Commands
	function canonicalizeLocaleTag(input: string): string {
		const raw = String(input ?? "").trim().replace(/_/g, "-");
		const base = raw.split(".")[0] ?? raw; // handle zh_TW.UTF-8
		const parts = base.split("-").filter(Boolean);
		if (parts.length === 0) return "en";
		const out: string[] = [];
		out.push((parts[0] ?? "en").toLowerCase());
		for (const p of parts.slice(1)) {
			if (p.length === 2) out.push(p.toUpperCase());
			else if (p.length === 4) out.push(p[0]!.toUpperCase() + p.slice(1).toLowerCase()); // Latn
			else out.push(p.toLowerCase());
		}
		return out.join("-");
	}

	function resolveLanguageArg(rawArgs: string, currentLocale: string):
		| { action: "pick" }
		| { action: "help" }
		| { action: "set"; locale: string }
		| { action: "error" } {
		const raw = String(rawArgs ?? "").trim();
		if (!raw) return { action: "pick" };
		const token = raw.split(/\s+/)[0] ?? "";
		const k1 = token.trim().toLowerCase().replace(/_/g, "-");
		const k2 = k1.replace(/-/g, "");

		if (["pick", "ui", "select"].includes(k1)) return { action: "pick" };
		if (["help", "h", "?"].includes(k1)) return { action: "help" };

		if (["toggle", "t"].includes(k1)) {
			const cur = String(currentLocale ?? "").toLowerCase();
			return { action: "set", locale: cur.startsWith("zh") ? "en" : "zh-TW" };
		}

		const aliases: Record<string, string> = {
			en: "en",
			eng: "en",
			english: "en",
			enus: "en-US",
			"en-us": "en-US",
			us: "en-US",
			"en-sg": "sg",
			ensg: "sg",
			sg: "sg",
			singapore: "sg",
			singlish: "sg",

			"zh-tw": "zh-TW",
			zhtw: "zh-TW",
			tw: "zh-TW",
			"zh-hant": "zh-TW",

			"zh-cn": "zh-CN",
			zhcn: "zh-CN",
			cn: "zh-CN",
			"zh-hans": "zh-CN",

			ja: "ja",
			jp: "ja",
			japanese: "ja",

			ko: "ko",
			kr: "ko",
			korean: "ko",

			es: "es",
			spa: "es",
			spanish: "es",

			pt: "pt-BR",
			ptbr: "pt-BR",
			"pt-br": "pt-BR",
			portuguese: "pt-BR",
			br: "pt-BR",
			"pt-pt": "pt-PT",
			ptpt: "pt-PT",

			fr: "fr",
			french: "fr",

			de: "de",
			german: "de",

			it: "it",
			italian: "it",

			nl: "nl",
			dutch: "nl",

			pl: "pl",
			polish: "pl",

			tr: "tr",
			turkish: "tr",

			vi: "vi",
			vietnamese: "vi",

			id: "id",
			indonesian: "id",

			uk: "uk",
			ukrainian: "uk",

			hi: "hi",
			hindi: "hi",

			sv: "sv",
			swedish: "sv",

			da: "da",
			danish: "da",

			fi: "fi",
			finnish: "fi",

			cs: "cs",
			czech: "cs",

			ro: "ro",
			romanian: "ro",

			el: "el",
			greek: "el",
		};

		const mapped = aliases[k1] ?? aliases[k2];
		if (mapped) return { action: "set", locale: mapped };

		// Accept well-formed locale tags directly (fr, ja, en-GB, zh-Hant-TW, ...)
		if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(k1)) {
			return { action: "set", locale: canonicalizeLocaleTag(k1) };
		}

		return { action: "error" };
	}

	async function commandLanguage(args: string, ctx: any): Promise<void> {
		const current = i18n.getLocale();
		const resolved = resolveLanguageArg(args, current);

		let locale: string | null = null;
		if (resolved.action === "help") {
			ctx.ui?.notify?.(i18n.t("pi.language.usage"), "info");
			return;
		}

		if (resolved.action === "error") {
			ctx.ui?.notify?.(i18n.t("pi.language.usage"), "warning");
			return;
		}

		if (resolved.action === "set") {
			locale = resolved.locale;
		} else {
			// Only show locales with a completed pi UI translation in the picker.
			// Other shipped bundles are fallback/staging bundles and remain available
			// through direct commands such as `/lang it` or the Other… prompt.
			const title = i18n.t("pi.language.dialog.title");
			const pick = i18n.t("pi.language.dialog.pick");

			const DISPLAY_NAMES: Record<string, string> = {
				en: "English",
				sg: "English (Singapore)",
				"zh-TW": "繁體中文",
				"zh-CN": "简体中文",
				ja: "日本語",
				ko: "한국어",
				es: "Español",
				"pt-BR": "Português (Brasil)",
				"pt-PT": "Português (Portugal)",
				fr: "Français",
				de: "Deutsch",
				it: "Italiano",
				nl: "Nederlands",
				pl: "Polski",
				tr: "Türkçe",
				vi: "Tiếng Việt",
				id: "Bahasa Indonesia",
				uk: "Українська",
				hi: "हिन्दी",
				sv: "Svenska",
				da: "Dansk",
				fi: "Suomi",
				cs: "Čeština",
				ro: "Română",
				el: "Ελληνικά",
			};

			const curCanon = canonicalizeLocaleTag(current);
			const ORDER = [
				"en",
				"sg",
				"zh-TW",
				"zh-CN",
				"ja",
				"ko",
				"es",
				"pt-BR",
				"pt-PT",
				"fr",
				"de",
				"it",
				"nl",
				"pl",
				"tr",
				"vi",
				"id",
				"uk",
				"hi",
				"sv",
				"da",
				"fi",
				"cs",
				"ro",
				"el",
			];
			const shipped = Array.from(shippedPiLocales);
			const byOrder = (a: string, b: string): number => {
				const ia = ORDER.indexOf(a);
				const ib = ORDER.indexOf(b);
				if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
				return a.localeCompare(b);
			};

			const pickerLocales = new Set(["en", "zh-TW", "zh-CN", "ja", "ko", "es", "pt-BR", "fr", "de"]);
			const known = shipped.filter((l) => pickerLocales.has(canonicalizeLocaleTag(l))).sort(byOrder);
			const options = [
				...known.map((l) => {
					const tag = canonicalizeLocaleTag(l);
					const name = DISPLAY_NAMES[tag] ?? tag;
					return `${name} (${tag})${tag === curCanon ? " ✓" : ""}`;
				}),
				i18n.t("pi.language.dialog.other"),
			];

			const choice = await ctx.ui.select(`${title}: ${pick}`, options);
			if (!choice) return;

			if (choice === i18n.t("pi.language.dialog.other")) {
				const other = await ctx.ui.input(title, i18n.t("pi.language.dialog.other.placeholder"));
				if (!other) return;
				locale = other;
			} else {
				const m = /\(([a-zA-Z0-9-]+)\)/.exec(choice);
				if (m?.[1]) locale = m[1];
				else {
					// Fallback: treat as manual input to avoid dead-ends.
					const other = await ctx.ui.input(title, i18n.t("pi.language.dialog.other.placeholder"));
					if (!other) return;
					locale = other;
				}
			}
		}

		const nextLocale = canonicalizeLocaleTag(locale);
		const prevLocale = i18n.getLocale();
		if (canonicalizeLocaleTag(prevLocale) === nextLocale) {
			ctx.ui?.notify?.(i18n.t("pi.language.alreadySet", { locale: prevLocale }), "info");
			return;
		}

		i18n.setLocale(nextLocale);
		localeSource = "command";
		ctx.ui?.setHiddenThinkingLabel?.(i18n.getLocale().startsWith("zh") ? "（思考已隱藏）" : "(thinking hidden)");
		saveUserI18nConfig({ locale: i18n.getLocale(), fallbackLocale: i18n.getFallbackLocale() });

		pi.events.emit("pi-i18n/localeChanged", { locale: i18n.getLocale(), prevLocale, source: "command" });
		ctx.ui?.notify?.(i18n.t("pi.language.changed", { locale: i18n.getLocale() }), "info");
		ctx.ui?.notify?.(i18n.t("pi.language.reloading", { locale: i18n.getLocale() }), "info");

		// Force full UI re-render (same as /reload).
		await ctx.reload();
		return;
	}

	function commandDoctor(_args: string, ctx: any): void {
		const { issues } = i18n.doctor();
		if (issues.length === 0) {
			ctx.ui.notify(i18n.t("pi.doctor.ok"), "info");
		} else {
			ctx.ui.notify(i18n.t("pi.doctor.issues", { count: issues.length }), "warning");
			for (const issue of issues.slice(0, 12)) {
				if (issue.type === "missing_key") {
					ctx.ui.notify(i18n.t("pi.doctor.missingKey", issue), "warning");
				} else {
					ctx.ui.notify(
						i18n.t("pi.doctor.placeholderMismatch", {
							namespace: issue.namespace,
							key: issue.key,
							expected: issue.expected.join(",") || "(none)",
							got: issue.got.join(",") || "(none)",
						}),
						"warning",
					);
				}
			}
		}

		const probe = getCoreProbeDebug();
		ctx.ui.notify(
			`probe: enabled=${probe.enabled} total=${probe.summary.total} matched=${probe.summary.matched} notFound=${probe.summary.notFound} unsafe=${probe.summary.unsafe} hit=${probe.summary.hit} translated=${probe.summary.translated}`,
			probe.summary.notFound > 0 || probe.summary.unsafe > 0 ? "warning" : "info",
		);

		const parity = verifyZhTwCoreHackParity();
		ctx.ui.notify(
			`core-hacks zh-TW parity: ok=${parity.ok} checked=${parity.checked}${parity.reason ? ` reason=${parity.reason}` : ""}`,
			parity.ok ? "info" : "warning",
		);
		if (!parity.ok && parity.mismatches[0]) {
			const m = parity.mismatches[0];
			ctx.ui.notify(`core-hacks parity mismatch: '${m.input}' -> legacy='${m.legacy}' current='${m.current}'`, "warning");
		}
	}

	function commandDebug(_args: string, ctx: any): void {
		const mode = getSlashDescMode();
		const core = getCoreDistDebug();
		const probe = getCoreProbeDebug();
		const lines = [
			`locale=${i18n.getLocale()} fallback=${i18n.getFallbackLocale()}`,
			`slashDescMode=${mode.mode}${mode.reason ? ` reason=${mode.reason}` : ""}`,
			`coreDist=${core.distDir ?? "<not found>"}${core.reason ? ` reason=${core.reason}` : ""}`,
			`probe.enabled=${probe.enabled} total=${probe.summary.total} matched=${probe.summary.matched} notFound=${probe.summary.notFound} hit=${probe.summary.hit} translated=${probe.summary.translated}`,
			getThinkDebug(thinkCache, i18n as unknown as I18nApi),
			getUiDebug(i18n.getLocale(), uiCache),
			`cwd=${ctx.cwd}`,
		];
		ctx.ui.notify(lines.join("\n"), mode.mode === "fallback" ? "warning" : "info");
	}

	async function commandHacks(_args: string, ctx: any): Promise<void> {
		const enabled = await ctx.ui.select(i18n.t("pi.language.dialog.title"), [i18n.t("pi.i18n.hacks.option.on"), i18n.t("pi.i18n.hacks.option.off")]);
		if (!enabled) return;
		if (enabled.endsWith("on")) {
			saveUserI18nConfig({ coreHacksEnabled: true });
			const res = await installCoreHacks(i18n as unknown as I18nApi);
			ctx.ui.notify(res.ok ? "core hacks enabled" : `core hacks failed: ${res.reason}`, res.ok ? "info" : "warning");
		} else {
			saveUserI18nConfig({ coreHacksEnabled: false });
			const res = await uninstallCoreHacks();
			ctx.ui.notify(res.ok ? "core hacks disabled" : `core hacks disable failed: ${res.reason}`, res.ok ? "info" : "warning");
		}
	}

	function commandProbe(args: string, ctx: any): void {
		const token = String(args ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "report";
		if (token === "reset") {
			resetCoreProbe();
			ctx.ui.notify(i18n.t("pi.i18n.probe.reset"), "info");
			return;
		}
		if (token === "on") {
			setCoreProbeEnabled(true);
			saveUserI18nConfig({ probeEnabled: true });
			ctx.ui.notify(i18n.t("pi.i18n.probe.enabled"), "info");
			return;
		}
		if (token === "off") {
			setCoreProbeEnabled(false);
			saveUserI18nConfig({ probeEnabled: false });
			ctx.ui.notify(i18n.t("pi.i18n.probe.disabled"), "info");
			return;
		}

		const snap = getCoreProbeDebug();
		ctx.ui.notify(
			`i18n probe: enabled=${snap.enabled} total=${snap.summary.total} matched=${snap.summary.matched} notFound=${snap.summary.notFound} unsafe=${snap.summary.unsafe} hit=${snap.summary.hit} translated=${snap.summary.translated}`,
			snap.summary.notFound > 0 || snap.summary.unsafe > 0 ? "warning" : "info",
		);
		for (const p of snap.points.slice(0, 20)) {
			ctx.ui.notify(
				`${p.id}: state=${p.state} hooked=${p.hooked} hit=${p.hits} translated=${p.translated}${p.reason ? ` reason=${p.reason}` : ""}`,
				p.state !== "matched" ? "warning" : "info",
			);
		}
	}

	async function commandSetup(args: string, ctx: any): Promise<void> {
		const preset = String(args ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "beginner";
		if (preset !== "beginner") {
			ctx.ui.notify(i18n.t("pi.i18n.setup.usage"), "warning");
			return;
		}
		const envRaw = detectLocaleFromEnv();
		let env = envRaw ? canonicalizeLocaleTag(envRaw) : "";
		// Keep setup aligned with our Singaporean English tag.
		if (env === "en-SG") env = "sg";
		const envLang = env.split("-")[0] ?? env;
		const preferred = shippedPiLocales.has(env) ? env : shippedPiLocales.has(envLang) ? envLang : "";
		const locale = preferred || (env && env.toLowerCase().startsWith("zh") ? "zh-TW" : i18n.getLocale().startsWith("zh") ? "zh-TW" : "en");
		saveUserI18nConfig({
			locale,
			fallbackLocale: "en",
			disableHeader: true,
			disableHeaderOnStartup: true,
			coreHacksEnabled: true,
			probeEnabled: true,
			preset: "beginner",
		});
		ctx.ui.notify(i18n.t("pi.i18n.setup.applied", { locale }), "info");
		await ctx.reload();
	}

	async function showDemoChat(ctx: any): Promise<void> {
		if (!ctx?.hasUI) return;

		await ctx.ui.custom<void>((_tui: any, theme: any, _kb: any, done: (v: void) => void) => {
			const c = new Container();
			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			c.addChild(new Text(theme.fg("accent", theme.bold(i18n.t("pi.demo.chat.title"))), 1, 0));
			c.addChild(new Spacer(1));

			c.addChild(new Text(theme.fg("muted", theme.bold(i18n.t("pi.demo.chat.userLabel"))), 1, 0));
			c.addChild(new Text(theme.fg("text", i18n.t("pi.demo.chat.userText")), 1, 0));
			c.addChild(new Spacer(1));

			c.addChild(new Text(theme.fg("muted", theme.bold(i18n.t("pi.demo.chat.assistantLabel"))), 1, 0));
			c.addChild(new Text(theme.fg("text", i18n.t("pi.demo.chat.assistantText")), 1, 0));
			c.addChild(new Spacer(1));

			c.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			c.addChild(new Text(theme.fg("dim", i18n.t("pi.demo.chat.closeHint")), 1, 0));

			return {
				render: (w: number) => c.render(w),
				invalidate: () => c.invalidate(),
				handleInput: (data: string) => {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) done(undefined);
				},
			};
		});
	}

	async function commandDemo(rawArgs: string, ctx: any): Promise<void> {
		const token = String(rawArgs ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "chat";
		if (!token || token === "chat") {
			await showDemoChat(ctx);
			return;
		}
		ctx.ui?.notify?.("Usage: /lang demo chat", "info");
	}

	async function dispatchI18nSubcommand(rawArgs: string, ctx: any): Promise<boolean> {
		const parts = String(rawArgs ?? "").trim().split(/\s+/).filter(Boolean);
		const sub = (parts[0] ?? "").toLowerCase();
		const rest = parts.slice(1).join(" ");
		if (!sub) return false;
		if (sub === "doctor") {
			commandDoctor(rest, ctx);
			return true;
		}
		if (sub === "debug") {
			commandDebug(rest, ctx);
			return true;
		}
		if (sub === "hacks") {
			await commandHacks(rest, ctx);
			return true;
		}
		if (sub === "probe") {
			commandProbe(rest, ctx);
			return true;
		}
		if (sub === "setup") {
			await commandSetup(rest, ctx);
			return true;
		}
		if (sub === "think") {
			const prevEnabled = isThinkEnabled(thinkCache);
			await commandThink(rest, { ...ctx, getAllTools: () => pi.getAllTools() }, i18n as unknown as I18nApi, thinkCache);
			const nextEnabled = isThinkEnabled(thinkCache);
			if ((rest === "on" || rest === "auto" || rest === "enable" || rest === "off" || rest === "disable") && prevEnabled !== nextEnabled) {
				notifyLanguageThinkStatus(ctx, i18n as unknown as I18nApi, nextEnabled);
			}
			return true;
		}
		if (sub === "demo") {
			await commandDemo(rest, ctx);
			return true;
		}
		return false;
	}

	// ── B 线：before_provider_request 替换 LLM 读到的 description ──────
	pi.on("before_provider_request", async (event: any, ctx: any) => {
		try {
			return await applyOnProviderRequest(event, ctx, i18n as unknown as I18nApi, thinkCache);
		} catch {
			// 替换失败不阻塞主对话（description 回退英文）
			return undefined;
		}
	});

	// ── 摘要本地化（整合自 pi-compaction-i18n）─────────────────────────
	// locale 复用 i18n.getLocale()，与 /lang 语言选择共享真相源。
	pi.on("session_before_compact", async (event, ctx) => {
		try {
			return await summarizeForCompaction(event, ctx, i18n.getLocale());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			try {
				ctx?.ui?.notify?.(`pi-di18n compaction failed [unknown]: ${message}`, "warning");
			} catch {
				// TUI notification is best-effort.
			}
			return { cancel: true };
		}
	});

	pi.on("session_before_tree", async (event, ctx) => {
		try {
			return await summarizeForTree(event, ctx, i18n.getLocale());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			try {
				ctx?.ui?.notify?.(`pi-di18n branch summary failed [unknown]: ${message}`, "warning");
			} catch {
				// TUI notification is best-effort.
			}
			return { cancel: true };
		}
	});

	const commandLang = async (args: string, ctx: any): Promise<void> => {
		if (await dispatchI18nSubcommand(args, ctx)) return;
		await commandLanguage(args, ctx);
	};

	pi.registerCommand("lang", {
		description: i18n.t("pi.language.command.description"),
		handler: commandLang,
	});

	// Optional tool for LLM to query current locale
	pi.registerTool({
		name: "i18n_get_locale",
		label: "i18n_get_locale",
		description: "Get current UI locale from pi-di18n",
		parameters: { type: "object", properties: {}, additionalProperties: false } as any,
		async execute() {
			const locale = i18n.getLocale();
			return {
				content: [{ type: "text", text: locale }],
				details: {
					locale,
					fallbackLocale: i18n.getFallbackLocale(),
					source: localeSource,
					shippedLocaleCount: shippedPiLocales.size,
					shippedLocales: Array.from(shippedPiLocales).sort(),
				},
			};
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", i18n.t("pi.tool.common.running")), 0, 0);
			const locale = result.content.find((item) => item.type === "text")?.text ?? "unknown";
			if (!expanded) {
				const summary = theme.fg("success", i18n.t("pi.tool.locale.compact", { locale }));
				const expandLabel = i18n.t("pi.ui.key.expand");
				let expandHint = expandLabel;
				try {
					expandHint = keyHint("app.tools.expand", expandLabel);
				} catch {
					// Rendering must remain available before Pi initializes the interactive theme.
				}
				return new Text(summary + theme.fg("dim", `  ${expandHint}`), 0, 0);
			}

			const details = result.details as { fallbackLocale?: string; source?: string; shippedLocaleCount?: number; shippedLocales?: string[] } | undefined;
			const fallbackLocale = details?.fallbackLocale ?? "unknown";
			const source = details?.source ?? "unknown";
			const sourceLabel = ["project", "user", "environment", "default", "command"].includes(source)
				? i18n.t(`pi.tool.locale.source.${source}`)
				: source;
			const shippedLocales = Array.isArray(details?.shippedLocales) ? details.shippedLocales : [];
			const shippedLocaleCount = details?.shippedLocaleCount ?? shippedLocales.length;
			const lines = [
				theme.fg("success", i18n.t("pi.tool.locale.current", { locale })),
				theme.fg("dim", i18n.t("pi.tool.locale.source", { source: sourceLabel })),
				theme.fg("dim", i18n.t("pi.tool.locale.fallback", { locale: fallbackLocale })),
				theme.fg("dim", i18n.t("pi.tool.locale.available", { count: shippedLocaleCount, locales: shippedLocales.join(", ") || "unknown" })),
			];
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
