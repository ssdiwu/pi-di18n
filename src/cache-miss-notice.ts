export type CacheMissNoticeKind = "generic" | "model-switch" | "idle";

export type CacheMissNotice = {
	kind: CacheMissNoticeKind;
	minutes?: number;
	tokens: string;
	cost?: string;
};

type CacheMissTemplates = {
	generic: string;
	modelSwitch: string;
	idle: string;
};

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const TEMPLATES: Record<string, CacheMissTemplates> = {
	en: {
		generic: "Cache miss: {tokens} tokens re-billed{cost}",
		modelSwitch: "Cache miss after model switch: {tokens} tokens re-billed{cost}",
		idle: "Cache miss after {minutes}m idle: {tokens} tokens re-billed{cost}",
	},
	"zh-CN": {
		generic: "缓存未命中：{tokens} Token 重新计费{cost}",
		modelSwitch: "切换模型后缓存未命中：{tokens} Token 重新计费{cost}",
		idle: "空闲 {minutes} 分钟后缓存未命中：{tokens} Token 重新计费{cost}",
	},
	"zh-TW": {
		generic: "快取未命中：{tokens} Token 重新計費{cost}",
		modelSwitch: "切換模型後快取未命中：{tokens} Token 重新計費{cost}",
		idle: "閒置 {minutes} 分鐘後快取未命中：{tokens} Token 重新計費{cost}",
	},
	ja: {
		generic: "キャッシュミス：{tokens} トークンを再請求{cost}",
		modelSwitch: "モデル切り替え後のキャッシュミス：{tokens} トークンを再請求{cost}",
		idle: "{minutes}分間アイドル後のキャッシュミス：{tokens} トークンを再請求{cost}",
	},
	ko: {
		generic: "캐시 미스: {tokens} 토큰 재청구{cost}",
		modelSwitch: "모델 전환 후 캐시 미스: {tokens} 토큰 재청구{cost}",
		idle: "{minutes}분 유휴 후 캐시 미스: {tokens} 토큰 재청구{cost}",
	},
	de: {
		generic: "Cache-Miss: {tokens} Token erneut berechnet{cost}",
		modelSwitch: "Cache-Miss nach Modellwechsel: {tokens} Token erneut berechnet{cost}",
		idle: "Cache-Miss nach {minutes} Min. Inaktivität: {tokens} Token erneut berechnet{cost}",
	},
	fr: {
		generic: "Échec du cache : {tokens} jetons refacturés{cost}",
		modelSwitch: "Échec du cache après changement de modèle : {tokens} jetons refacturés{cost}",
		idle: "Échec du cache après {minutes} min d’inactivité : {tokens} jetons refacturés{cost}",
	},
	es: {
		generic: "Fallo de caché: {tokens} tokens refacturados{cost}",
		modelSwitch: "Fallo de caché tras cambiar de modelo: {tokens} tokens refacturados{cost}",
		idle: "Fallo de caché tras {minutes} min de inactividad: {tokens} tokens refacturados{cost}",
	},
	"pt-BR": {
		generic: "Falha de cache: {tokens} tokens cobrados novamente{cost}",
		modelSwitch: "Falha de cache após trocar de modelo: {tokens} tokens cobrados novamente{cost}",
		idle: "Falha de cache após {minutes} min de inatividade: {tokens} tokens cobrados novamente{cost}",
	},
};

function canonicalizeLocale(locale: string): string {
	const parts = String(locale ?? "").trim().replace(/_/g, "-").split("-").filter(Boolean);
	if (parts.length === 0) return "en";
	return [parts[0]!.toLowerCase(), ...parts.slice(1).map((part) => part.length === 2 ? part.toUpperCase() : part.toLowerCase())].join("-");
}

function templatesFor(locale: string): CacheMissTemplates {
	const canonical = canonicalizeLocale(locale);
	if (canonical === "zh-hant" || canonical.startsWith("zh-hant-")) return TEMPLATES["zh-TW"]!;
	if (canonical === "zh-hans" || canonical.startsWith("zh-hans-")) return TEMPLATES["zh-CN"]!;
	if (canonical === "pt" || canonical.startsWith("pt-")) return TEMPLATES["pt-BR"]!;
	return TEMPLATES[canonical] ?? TEMPLATES[canonical.split("-")[0]!] ?? TEMPLATES.en!;
}

export function stripAnsi(text: string): string {
	return String(text ?? "").replace(ANSI_ESCAPE, "");
}

export function parseCacheMissNotice(text: string): CacheMissNotice | null {
	const plain = stripAnsi(text).trim();
	const suffix = String.raw`(?::\s+)(?<tokens>\S+) tokens re-billed(?:\s+\(~\$(?<cost>[0-9]+(?:\.[0-9]+)?)\))?$`;
	const modelSwitch = new RegExp(String.raw`^Cache miss after model switch${suffix}`);
	const idle = new RegExp(String.raw`^Cache miss after (?<minutes>\d+)m idle${suffix}`);
	const generic = new RegExp(String.raw`^Cache miss${suffix}`);

	for (const [kind, pattern] of [["model-switch", modelSwitch], ["idle", idle], ["generic", generic]] as const) {
		const match = plain.match(pattern);
		if (!match?.groups?.tokens) continue;
		return {
			kind,
			tokens: match.groups.tokens,
			minutes: match.groups.minutes ? Number(match.groups.minutes) : undefined,
			cost: match.groups.cost,
		};
	}
	return null;
}

function formatCost(locale: string, cost: string | undefined): string {
	if (!cost) return "";
	const canonical = canonicalizeLocale(locale);
	if (canonical === "zh-CN" || canonical.startsWith("zh-CN-")) return `（约 $${cost}）`;
	if (canonical === "zh-TW" || canonical.startsWith("zh-TW-")) return `（約 $${cost}）`;
	if (canonical === "zh-hans" || canonical.startsWith("zh-hans-")) return `（约 $${cost}）`;
	if (canonical === "zh-hant" || canonical.startsWith("zh-hant-")) return `（約 $${cost}）`;
	if (canonical === "ja" || canonical.startsWith("ja-")) return `（約 $${cost}）`;
	if (canonical === "ko" || canonical.startsWith("ko-")) return `（약 $${cost}）`;
	if (canonical === "fr" || canonical.startsWith("fr-")) return ` (≈ $${cost})`;
	if (canonical === "es" || canonical.startsWith("es-")) return ` (~$${cost})`;
	if (canonical === "de" || canonical.startsWith("de-")) return ` (~$${cost})`;
	return ` (~$${cost})`;
}

export function formatCacheMissNotice(locale: string, notice: CacheMissNotice): string {
	const templates = templatesFor(locale);
	const template = notice.kind === "model-switch" ? templates.modelSwitch : notice.kind === "idle" ? templates.idle : templates.generic;
	return template
		.replaceAll("{minutes}", String(notice.minutes ?? 0))
		.replaceAll("{tokens}", notice.tokens)
		.replaceAll("{cost}", formatCost(locale, notice.cost));
}
