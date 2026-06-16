export type Locale = string;

export type MessageValue =
	| string
	| {
			description?: string;
			value: string;
	  }
	| {
			description?: string;
			value: Record<string, string>; // plural/select categories (one/other/...)
	  };

export type BundleV1 = {
	version: 1;
	namespace: string;
	locale: Locale;
	messages: Record<string, MessageValue>;
	// Optional upstream-compatible metadata. Ignored by runtime if absent.
	integration?: {
		capability?: "pi.i18n.v1";
		provider?: string;
		coreCompat?: {
			minContractVersion?: number;
			detectionEvent?: string;
		};
	};
};

export type I18nDoctorIssue =
	| { type: "missing_key"; namespace: string; key: string }
	| { type: "placeholder_mismatch"; namespace: string; key: string; expected: string[]; got: string[] };

export type I18nApi = {
	getLocale(): Locale;
	setLocale(locale: Locale): void;
	getFallbackLocale(): Locale;
	setFallbackLocale(locale: Locale): void;
	registerBundle(bundle: BundleV1): { ok: boolean; errors: string[] };
	t(fullKey: string, params?: Record<string, string | number>): string;
	onLocaleChanged(cb: (locale: Locale) => void): () => void;
	doctor(): { issues: I18nDoctorIssue[] };
	listNamespaces(): string[];
};
