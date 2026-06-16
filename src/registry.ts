import type { BundleV1, I18nApi, I18nDoctorIssue, Locale, MessageValue } from "./types";

type BundleIndex = Map<string, Map<Locale, BundleV1>>; // namespace -> locale -> bundle

type NormalizedMessage = {
	kind: "simple" | "plural";
	text?: string;
	forms?: Record<string, string>;
};

type NormalizedBundle = {
	bundle: BundleV1;
	messages: Map<string, NormalizedMessage>;
	placeholders: Map<string, Set<string>>; // key -> placeholders
};

type NormalizedIndex = Map<string, Map<Locale, NormalizedBundle>>;

function normalizeLocale(input: string): string {
	const s = String(input || "").trim();
	if (!s) return "en";
	// handle things like zh_TW.UTF-8
	const base = s.split(".")[0] ?? s;
	return base.replace(/_/g, "-");
}

function isRtlLocale(locale: string): boolean {
	const l = normalizeLocale(locale).toLowerCase();
	const lang = l.split("-")[0] ?? l;
	return ["ar", "he", "fa", "ur"].includes(lang);
}

function extractPlaceholders(template: string): Set<string> {
	const set = new Set<string>();
	const re = /\{([a-zA-Z0-9_]+)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(template))) {
		const name = m[1];
		if (name) set.add(name);
	}
	return set;
}

function getRawMessageText(value: MessageValue): string | Record<string, string> {
	if (typeof value === "string") return value;
	return value.value;
}

function normalizeMessage(value: MessageValue): NormalizedMessage {
	const raw = getRawMessageText(value);
	if (typeof raw === "string") return { kind: "simple", text: raw };
	return { kind: "plural", forms: raw };
}

function formatWithParams(template: string, params: Record<string, string | number> | undefined): string {
	if (!params) return template;
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, name: string) => {
		const v = params[name];
		return v === undefined || v === null ? `{${name}}` : String(v);
	});
}

export class I18nRegistry implements I18nApi {
	private locale: Locale;
	private fallbackLocale: Locale;
	private bundles: BundleIndex;
	private normalized: NormalizedIndex;
	private listeners = new Set<(l: Locale) => void>();

	constructor(options?: { locale?: string; fallbackLocale?: string }) {
		this.locale = normalizeLocale(options?.locale ?? "en");
		this.fallbackLocale = normalizeLocale(options?.fallbackLocale ?? "en");
		this.bundles = new Map();
		this.normalized = new Map();
	}

	getLocale(): Locale {
		return this.locale;
	}

	getFallbackLocale(): Locale {
		return this.fallbackLocale;
	}

	setFallbackLocale(locale: Locale): void {
		this.fallbackLocale = normalizeLocale(locale);
	}

	setLocale(locale: Locale): void {
		const next = normalizeLocale(locale);
		if (next === this.locale) return;
		this.locale = next;
		for (const cb of this.listeners) cb(this.locale);
	}

	onLocaleChanged(cb: (locale: Locale) => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	listNamespaces(): string[] {
		return Array.from(this.bundles.keys()).sort();
	}

	registerBundle(bundle: BundleV1): { ok: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!bundle || bundle.version !== 1) errors.push("bundle.version must be 1");
		if (!bundle.namespace || typeof bundle.namespace !== "string") errors.push("bundle.namespace required");
		if (!bundle.locale || typeof bundle.locale !== "string") errors.push("bundle.locale required");
		if (!bundle.messages || typeof bundle.messages !== "object") errors.push("bundle.messages required");
		if (errors.length) return { ok: false, errors };

		const locale = normalizeLocale(bundle.locale);
		const ns = bundle.namespace;

		let byLocale = this.bundles.get(ns);
		if (!byLocale) {
			byLocale = new Map();
			this.bundles.set(ns, byLocale);
		}
		byLocale.set(locale, { ...bundle, locale });

		// normalize and cache placeholders
		let normByLocale = this.normalized.get(ns);
		if (!normByLocale) {
			normByLocale = new Map();
			this.normalized.set(ns, normByLocale);
		}

		const msgMap = new Map<string, NormalizedMessage>();
		const phMap = new Map<string, Set<string>>();
		for (const [k, v] of Object.entries(bundle.messages)) {
			const nm = normalizeMessage(v);
			msgMap.set(k, nm);
			if (nm.kind === "simple" && nm.text !== undefined) {
				phMap.set(k, extractPlaceholders(nm.text));
			} else if (nm.kind === "plural" && nm.forms) {
				const union = new Set<string>();
				for (const form of Object.values(nm.forms)) {
					for (const ph of extractPlaceholders(form)) union.add(ph);
				}
				phMap.set(k, union);
			}
		}

		normByLocale.set(locale, { bundle: { ...bundle, locale }, messages: msgMap, placeholders: phMap });
		return { ok: true, errors: [] };
	}

	/** Find the best namespace match for a fullKey using longest prefix match. */
	private resolveNamespace(fullKey: string): { namespace: string | null; key: string } {
		const k = String(fullKey || "");
		let best: string | null = null;
		for (const ns of this.bundles.keys()) {
			if (k === ns || k.startsWith(ns + ".")) {
				if (!best || ns.length > best.length) best = ns;
			}
		}
		if (!best) {
			// default convention: first segment as namespace
			const idx = k.indexOf(".");
			if (idx > 0) return { namespace: k.slice(0, idx), key: k.slice(idx + 1) };
			return { namespace: null, key: k };
		}
		const key = k === best ? "" : k.slice(best.length + 1);
		return { namespace: best, key };
	}

	private getMessage(ns: string, locale: Locale, key: string): NormalizedMessage | null {
		const n = this.normalized.get(ns)?.get(locale);
		if (!n) return null;
		return n.messages.get(key) ?? null;
	}

	private choosePluralForm(locale: Locale, forms: Record<string, string>, params: Record<string, string | number> | undefined): string {
		const countRaw = params?.count;
		const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
		if (!Number.isFinite(count)) return forms.other ?? forms.one ?? Object.values(forms)[0] ?? "";
		const rules = new Intl.PluralRules(locale);
		const cat = rules.select(count);
		return forms[cat] ?? forms.other ?? forms.one ?? Object.values(forms)[0] ?? "";
	}

	t(fullKey: string, params?: Record<string, string | number>): string {
		const { namespace, key } = this.resolveNamespace(fullKey);
		if (!namespace || !key) {
			return String(fullKey || "");
		}

		const loc = this.locale;
		const fb = this.fallbackLocale;

		let msg = this.getMessage(namespace, loc, key);
		if (!msg && fb && fb !== loc) msg = this.getMessage(namespace, fb, key);
		if (!msg) return `${namespace}.${key}`;

		let template = "";
		if (msg.kind === "simple") {
			template = msg.text ?? "";
		} else {
			template = this.choosePluralForm(loc, msg.forms ?? {}, params);
		}

		return formatWithParams(template, params);
	}

	doctor(): { issues: I18nDoctorIssue[] } {
		const issues: I18nDoctorIssue[] = [];
		for (const ns of this.bundles.keys()) {
			const base = this.normalized.get(ns)?.get(this.fallbackLocale) ?? this.normalized.get(ns)?.get("en");
			if (!base) continue;

			const current = this.normalized.get(ns)?.get(this.locale);
			for (const key of base.messages.keys()) {
				if (!current?.messages.has(key)) {
					issues.push({ type: "missing_key", namespace: ns, key });
					continue;
				}
				const expected = Array.from(base.placeholders.get(key) ?? []).sort();
				const got = Array.from(current.placeholders.get(key) ?? []).sort();
				const mismatch = expected.join(",") !== got.join(",");
				if (mismatch) {
					issues.push({ type: "placeholder_mismatch", namespace: ns, key, expected, got });
				}
			}
		}
		return { issues };
	}

	/** Exposed utility for adapters. */
	isRtlSelected(): boolean {
		return isRtlLocale(this.locale);
	}
}
