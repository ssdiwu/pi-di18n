import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { statePath } from "./state-paths.js";

export type I18nConfig = {
	locale?: string;
	fallbackLocale?: string;
	// If true, pi-di18n will never call ctx.ui.setHeader(...).
	disableHeader?: boolean;
	// If true, pi-di18n will not set header during session_start.
	// (It may still set header later on explicit actions like /language.)
	disableHeaderOnStartup?: boolean;
	// Enable/disable runtime core hacks (default: true)
	coreHacksEnabled?: boolean;
	// Enable/disable runtime probe telemetry for patch health (default: true)
	probeEnabled?: boolean;
	// Last setup preset applied by /lang setup
	preset?: "beginner" | "manual";
	// reserved for future (rtl, punctuation, etc.)
	showEnglishInParens?: boolean;
};

function readJson(path: string): any {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return null;
	}
}

function writeJson(path: string, value: any): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function getUserConfigPath(): string {
	return statePath("config.json");
}

export function getProjectConfigPath(cwd: string): string {
	return join(cwd, ".pi", "state", "pi-di18n", "config.json");
}

export function loadI18nConfig(cwd: string): { source: "project" | "user" | "none"; config: I18nConfig } {
	const projectPath = getProjectConfigPath(cwd);
	const project = readJson(projectPath);
	if (project && typeof project === "object") return { source: "project", config: project as I18nConfig };

	const userPath = getUserConfigPath();
	const user = readJson(userPath);
	if (user && typeof user === "object") return { source: "user", config: user as I18nConfig };

	return { source: "none", config: {} };
}

export function saveUserI18nConfig(patch: I18nConfig): void {
	const path = getUserConfigPath();
	const current = readJson(path);
	const next = { ...(current && typeof current === "object" ? current : {}), ...patch };
	writeJson(path, next);
}

export function detectLocaleFromEnv(): string | undefined {
	const candidates = [process.env.PI_LOCALE, process.env.LC_ALL, process.env.LANG].filter(Boolean) as string[];
	for (const raw of candidates) {
		const s = raw.trim();
		if (!s) continue;
		// common: zh_TW.UTF-8
		const base = (s.split(".")[0] ?? s).replace(/_/g, "-");
		if (base) return base;
	}
	return undefined;
}
