// A-line runtime UI description localizer.
// Prefetches extension/prompt/skill command descriptions asynchronously and caches them.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { I18nApi } from "../types.js";
import { translateBatch } from "../think/translator.js";
import type { UiCache } from "./cache.js";
import { getCachedCommandDescription, putCachedCommandDescription } from "./cache.js";

const inFlight = new Map<string, Promise<string | undefined>>();

function localeNeedsTranslate(locale: string): boolean {
	const l = String(locale || "").toLowerCase();
	return l !== "" && l !== "en";
}

function flightKey(locale: string, key: string): string {
	return `${locale}:command:${key}`;
}

function commandKey(name: string): string {
	return `command:${name}`;
}

export function resolveRuntimeCommandDescription(locale: string, name: string, en: string | undefined, cache: UiCache): string | undefined {
	if (!en || !localeNeedsTranslate(locale)) return undefined;
	return getCachedCommandDescription(locale, commandKey(name), en, cache);
}

export function prefetchUiDescriptionsOnSessionStart(pi: ExtensionAPI, ctx: any, i18n: I18nApi, cache: UiCache): void {
	const locale = i18n.getLocale();
	if (!localeNeedsTranslate(locale)) return;

	let commands: Array<{ name: string; description?: string; source?: string }>;
	try {
		commands = pi.getCommands() as any;
	} catch {
		return;
	}

	const pending: Array<{ key: string; name: string; en: string }> = [];
	for (const cmd of commands) {
		if (!cmd?.name || typeof cmd.description !== "string" || !cmd.description.trim()) continue;
		const key = commandKey(cmd.name);
		if (getCachedCommandDescription(locale, key, cmd.description, cache)) continue;
		if (inFlight.has(flightKey(locale, key))) continue;
		pending.push({ key, name: cmd.name, en: cmd.description });
	}
	if (pending.length === 0) return;

	const batch = translateBatch(ctx, pending.map((p) => ({ key: p.key, en: p.en })), locale).catch(() => new Map<string, string>());
	for (const item of pending) {
		const ifk = flightKey(locale, item.key);
		const promise = batch
			.then((translated) => {
				const v = translated.get(item.key);
				if (v) putCachedCommandDescription(cache, locale, item.key, item.en, v);
				return v;
			})
			.finally(() => inFlight.delete(ifk));
		inFlight.set(ifk, promise);
	}
}
