import type { I18nApi } from "./types";
import { CombinedAutocompleteProvider, Loader, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { getProbeSnapshot, probeHit, probeHook, resetProbe, setProbeEnabled } from "./probe";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveRuntimeCommandDescription } from "./ui-localize/localize";
import { getActiveUiCache } from "./ui-localize/cache";
import { formatCacheMissNotice, parseCacheMissNotice, stripAnsi } from "./cache-miss-notice";

const g = globalThis as any;
const STATE_KEY = "__pi_i18n_core_hacks__";
const I18N_PTR_KEY = "__pi_i18n_current_api__";

// Tracks whether built-in slash command descriptions were localized by patching core (primary)
// or by patching autocomplete UI output (fallback).
type SlashDescMode = "primary" | "fallback" | "none";
const SLASH_DESC_MODE_KEY = "__pi_i18n_slash_desc_mode__";
const SLASH_DESC_REASON_KEY = "__pi_i18n_slash_desc_reason__";

// NOTE: This module intentionally uses monkeypatching against pi-core internals.
// It is best-effort, version-fragile, and guarded by try/catch.
// Goals:
// - improve zh-TW coverage without pi-core changes
// - never touch model output (only core status/error/warn messages)
// - fail closed (do nothing if internals moved)

type HackState = {
	installed: boolean;
	original?: {
		showStatus?: any;
		showWarning?: any;
		showError?: any;
		showSelector?: any;
		// Original built-in slash command descriptions (by name)
		slashDescs?: Record<string, string | undefined>;
	};
};

function getState(): HackState {
	if (!g[STATE_KEY]) g[STATE_KEY] = { installed: false } as HackState;
	return g[STATE_KEY] as HackState;
}

function setCurrentI18n(api: I18nApi): void {
	g[I18N_PTR_KEY] = api;
}

function getCurrentI18n(): I18nApi | null {
	return (g[I18N_PTR_KEY] as I18nApi | undefined) ?? null;
}

function setSlashDescMode(mode: SlashDescMode, reason?: string): void {
	g[SLASH_DESC_MODE_KEY] = mode;
	g[SLASH_DESC_REASON_KEY] = reason;
}

export function getSlashDescMode(): { mode: SlashDescMode; reason?: string } {
	return {
		mode: (g[SLASH_DESC_MODE_KEY] as SlashDescMode | undefined) ?? "none",
		reason: (g[SLASH_DESC_REASON_KEY] as string | undefined) ?? undefined,
	};
}

export function shouldWarnCoreMisalignment(i18n: I18nApi): boolean {
	// Warn when we *wanted* localization (non-English locale selected) but had to fall back.
	const l = String(i18n.getLocale() || "").toLowerCase();
	const lang = (l.split("-")[0] ?? l).trim();
	if (!lang || lang === "en") return false;
	return getSlashDescMode().mode === "fallback";
}

export function setCoreProbeEnabled(enabled: boolean): void {
	setProbeEnabled(enabled);
}

export function resetCoreProbe(): void {
	resetProbe();
}

export function getCoreProbeDebug(): { enabled: boolean; summary: any; points: any[] } {
	return getProbeSnapshot();
}

type CoreDistResolution = {
	distDir: string | null;
	reason?: string;
};

const CORE_DIST_KEY = "__pi_i18n_core_dist_dir__";
const CORE_DIST_REASON_KEY = "__pi_i18n_core_dist_reason__";

let _coreDist: CoreDistResolution | null = null;

function setCoreDist(distDir: string | null, reason?: string): void {
	g[CORE_DIST_KEY] = distDir;
	g[CORE_DIST_REASON_KEY] = reason;
	_coreDist = { distDir, reason };
}

export function getCoreDistDebug(): CoreDistResolution {
	return {
		distDir: (g[CORE_DIST_KEY] as string | null | undefined) ?? _coreDist?.distDir ?? null,
		reason: (g[CORE_DIST_REASON_KEY] as string | undefined) ?? _coreDist?.reason,
	};
}

function findPiCodingAgentDistDir(): string | null {
	if (_coreDist) return _coreDist.distDir;

	const looksLikeDist = (distDir: string) => existsSync(join(distDir, "core", "slash-commands.js"));

	const probeFromFile = (filePath: string): string | null => {
		try {
			if (!filePath) return null;
			// argv often contains symlinks (e.g. /usr/bin/pi -> .../dist/cli.js). Resolve so we can find dist.
			let fp = filePath;
			try {
				fp = realpathSync(filePath);
			} catch {
				// ignore
			}
			const d = dirname(fp);
			for (let up = 0; up <= 6; up++) {
				const root = resolve(d, ...Array(up).fill(".."));
				const distDir = join(root, "dist");
				if (looksLikeDist(distDir)) return distDir;
				if (looksLikeDist(root)) return root;
			}
		} catch {
			// ignore
		}
		return null;
	};

	// 1) argv anchors
	for (const a of process.argv ?? []) {
		if (typeof a !== "string") continue;
		const hit = probeFromFile(a);
		if (hit) {
			setCoreDist(hit);
			return hit;
		}
	}

	// 2) Global npm install location (Windows)
	try {
		const appData = process.env.APPDATA;
		if (appData) {
			const distDir = join(appData, "npm", "node_modules", "@earendil-works", "pi-coding-agent", "dist");
			if (looksLikeDist(distDir)) {
				setCoreDist(distDir);
				return distDir;
			}
		}
	} catch {
		// ignore
	}

	// 3) Common fallback based on homedir
	try {
		const distDir = join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@earendil-works", "pi-coding-agent", "dist");
		if (looksLikeDist(distDir)) {
			setCoreDist(distDir);
			return distDir;
		}
	} catch {
		// ignore
	}

	// 4) Global npm install location (Linux/macOS)
	try {
		const candidates: string[] = [];
		// Debian/Ubuntu global npm prefix (common in containers/WSL when installed via apt/npm as root)
		candidates.push(join("/usr", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "dist"));
		candidates.push(join("/usr", "local", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "dist"));
		// npm --prefix ~/.local
		candidates.push(join(homedir(), ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "dist"));
		for (const distDir of candidates) {
			if (looksLikeDist(distDir)) {
				setCoreDist(distDir);
				return distDir;
			}
		}
	} catch {
		// ignore
	}

	setCoreDist(null, "pi-coding-agent dist dir not found");
	return null;
}

async function importFromPiCodingAgentDist(relPathFromDist: string): Promise<any> {
	const distDir = findPiCodingAgentDistDir();
	if (!distDir) throw new Error(getCoreDistDebug().reason ?? "pi-coding-agent dist dir not found");
	const abs = join(distDir, relPathFromDist);
	if (!existsSync(abs)) throw new Error(`core file not found: ${abs}`);
	return await import(pathToFileURL(abs).href);
}

function patchMethod(proto: any, name: string, make: (orig: any) => any, probeId?: string): void {
	const cur = proto?.[name];
	if (typeof cur !== "function") {
		if (probeId) probeHook(probeId, "notFound", `${name} missing`);
		return;
	}
	if ((cur as any).__pi_i18n_patched__) {
		if (probeId) probeHook(probeId, "matched", "already patched");
		return;
	}
	const patched = make(cur);
	(patched as any).__pi_i18n_patched__ = true;
	(patched as any).__pi_i18n_original__ = cur;
	proto[name] = patched;
	if (probeId) probeHook(probeId, "matched");
}

function isZhTw(locale: string): boolean {
	const l = String(locale || "").toLowerCase();
	return l === "zh-tw" || l.startsWith("zh-tw-") || l.startsWith("zh-hant");
}

function isZhCn(locale: string): boolean {
	const l = String(locale || "").toLowerCase();
	return l === "zh-cn" || l.startsWith("zh-cn-") || l.startsWith("zh-hans");
}

/**
 * 非 en（包括 en-US/en-GB 等变体）的任意本地化 locale。
 * pi-di18n：slash 描述本地化应对所有非 en locale 生效，
 * 不再像 pi-i18n 那样写死只对 zh-TW 启用。
 */
function isLocalizedLocale(locale: string): boolean {
	const l = String(locale || "").toLowerCase().trim();
	if (!l) return false;
	const lang = (l.split("-")[0] ?? l).trim();
	return lang !== "en";
}

type CoreHackLocalePackV1 = {
	version: 1;
	locale: string;
	exact: Record<string, string>;
};

const CORE_HACK_PACK_CACHE_KEY = "__pi_i18n_core_hack_packs__";
const CORE_HACK_PACK_LOADED_KEY = "__pi_i18n_core_hack_packs_loaded__";

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

function getCoreHackPackCache(): Record<string, CoreHackLocalePackV1> {
	if (!g[CORE_HACK_PACK_CACHE_KEY]) g[CORE_HACK_PACK_CACHE_KEY] = {} as Record<string, CoreHackLocalePackV1>;
	return g[CORE_HACK_PACK_CACHE_KEY] as Record<string, CoreHackLocalePackV1>;
}

function loadCoreHackPacksOnce(): void {
	if (g[CORE_HACK_PACK_LOADED_KEY]) return;
	g[CORE_HACK_PACK_LOADED_KEY] = true;
	try {
		const baseDir = dirname(fileURLToPath(import.meta.url));
		const packDir = join(baseDir, "core-hacks-locales");
		if (!existsSync(packDir)) return;
		const files = readdirSync(packDir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
		const cache = getCoreHackPackCache();
		for (const f of files) {
			try {
				const raw = readFileSync(join(packDir, f), "utf-8");
				const obj = JSON.parse(raw) as Partial<CoreHackLocalePackV1>;
				if (obj.version !== 1) continue;
				if (!obj.locale || typeof obj.locale !== "string") continue;
				if (!obj.exact || typeof obj.exact !== "object") continue;
				const key = canonicalizeLocaleTag(obj.locale);
				cache[key] = { version: 1, locale: key, exact: obj.exact as Record<string, string> };
			} catch {
				// ignore invalid pack
			}
		}
	} catch {
		// ignore
	}
}

function getCoreHackPack(locale: string): CoreHackLocalePackV1 | null {
	loadCoreHackPacksOnce();
	const l = canonicalizeLocaleTag(locale);
	const cache = getCoreHackPackCache();
	return cache[l] ?? cache[l.split("-")[0] ?? ""] ?? null;
}

// Full-dist scan anchor set (kept inline on purpose so NEED scan can prove coverage
// against currently known core literals before we finish false-positive pruning).
const CORE_FULL_SCAN_ANCHORS: string[] = [
	"Cancel or abort",
	"ctrl+c",
	"Clear editor",
	"ctrl+d",
	"Exit when editor is empty",
	"Suspend to background",
	"Cycle thinking level",
	"Cycle to next model",
	"Cycle to previous model",
	"ctrl+l",
	"Open model selector",
	"ctrl+o",
	"Toggle tool output",
	"Toggle thinking blocks",
	"Toggle named session filter",
	"Open external editor",
	"Queue follow-up message",
	"Restore queued messages",
	"Paste image from clipboard",
	"Open session tree",
	"Fork current session",
	"Resume a session",
	"Fold tree branch or move up",
	"Unfold tree branch or move down",
	"Edit tree label",
	"Toggle tree label timestamps",
	"Toggle session path display",
	"Toggle session sort mode",
	"Rename session",
	"Delete session",
	"Delete session when query is empty",
	"Bash command to execute",
	"Timeout in seconds (optional, no default timeout)",
	" (timeout ${timeout}s)",
	"... (${state.cachedSkipped} earlier lines,",
	"Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.",
	"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
	"Replacement text for this targeted edit.",
	"Path to the file to edit (relative or absolute)",
	"One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
	"Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.",
	"Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'",
	"Directory to search in (default: current directory)",
	"Maximum number of results (default: 1000)",
	" (limit ${limit})",
	"Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).",
	"Search pattern (regex or literal string)",
	"Directory or file to search (default: current directory)",
	"Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'",
	"Case-insensitive search (default: false)",
	"Treat pattern as literal string instead of regex (default: false)",
	"Number of lines to show before and after each match (default: 0)",
	"Maximum number of matches to return (default: 100)",
	" limit ${limit}",
	"Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.",
	"Directory to list (default: current directory)",
	"Maximum number of entries to return (default: 500)",
	"List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).",
	"Path to the file to read (relative or absolute)",
	"Line number to start reading from (1-indexed)",
	"Maximum number of lines to read",
	":${startLine}${endLine ? ",
	"Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.",
	"[invalid arg]",
	"Path to the file to write (relative or absolute)",
	"Content to write to the file",
	"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
	"Move cursor up",
	"Move cursor down",
	"Move cursor left",
	"Move cursor right",
	"Move cursor word left",
	"Move cursor word right",
	"Move to line start",
	"Move to line end",
	"Jump forward to character",
	"Jump backward to character",
	"Page up",
	"Page down",
	"Delete character backward",
	"Delete character forward",
	"Delete word backward",
	"Delete word forward",
	"Delete to line start",
	"Delete to line end",
	"ctrl+y",
	"Yank",
	"alt+y",
	"Yank pop",
	"ctrl+-",
	"Undo",
	"shift+enter",
	"Insert newline",
	"Submit input",
	"Tab / autocomplete",
	"Copy selection",
	"Move selection up",
	"Move selection down",
	"Selection page up",
	"Selection page down",
	"Confirm selection",
	"Cancel selection",
];

const ZH_TW_PARITY_SAMPLES: string[] = [
	"Forked to new session",
	"Resumed session",
	"Resume cancelled",
	"Nothing to compact (no messages yet)",
	"Compaction cancelled",
	"Auto-compaction cancelled",
	"No entries in session",
	"No queued messages to restore",
	"Current model does not support thinking",
	"No models available",
	"Queued message for after compaction",
	"Reloaded keybindings, extensions, skills, prompts, themes",
	"Wait for the current response to finish before reloading.",
	"Wait for compaction to finish before reloading.",
	"Suspend to background is not supported on Windows",
	"GitHub CLI is not logged in. Run 'gh auth login' first.",
	"No OAuth providers logged in. Use /login first.",
	"(cancelled)",
	"Resource Configuration",
	"Model Configuration",
	"Session-only. Ctrl+S to save to settings.",
	"(unsaved)",
	"Rename Session",
	"Auto-compact",
	"Hide thinking",
	"Quiet startup",
];

const EXACT_WHOLE_LINE_ONLY_KEYS = new Set([
	"Yes",
	"No",
	"Ask",
	"configure",
	"Always trust",
	"Never trust",
]);

function applyExactMap(s: string, exact?: Record<string, string>): string {
	if (!exact) return s;

	// Guard against partial/mixed translations: short generic tokens like "Yes"/"No"
	// should not be replaced as substrings inside longer sentences.
	if (EXACT_WHOLE_LINE_ONLY_KEYS.has(s) && typeof exact[s] === "string") {
		return exact[s] as string;
	}

	const entries = Object.entries(exact)
		.filter(([from, to]) => typeof from === "string" && typeof to === "string" && from.length > 0 && from !== to)
		.sort((a, b) => b[0].length - a[0].length);
	let out = s;
	for (const [from, to] of entries) {
		if (EXACT_WHOLE_LINE_ONLY_KEYS.has(from)) continue;
		out = out.replaceAll(from, to);
	}
	return out;
}

function tCoreFromPack(i18n: I18nApi, msg: string): string {
	const s = String(msg ?? "");
	if (CORE_FULL_SCAN_ANCHORS.length < 0) return s;
	const pack = getCoreHackPack(i18n.getLocale());
	if (!pack) return s;
	const translated = applyExactMap(s, pack.exact);
	return isZhCn(i18n.getLocale()) ? postprocessZhCnUiLine(translated) : translated;
}

function tCore(i18n: I18nApi, msg: string): string {
	// Hard guard: preserve legacy zh-TW monkeypatch behavior byte-for-byte.
	if (isZhTw(i18n.getLocale())) return tCoreLegacyZhTw(i18n, msg);
	return tCoreFromPack(i18n, msg);
}

export function verifyZhTwCoreHackParity(): {
	ok: boolean;
	checked: number;
	mismatches: { input: string; legacy: string; current: string }[];
	reason?: string;
} {
	try {
		const fake = { getLocale: () => "zh-TW" } as any as I18nApi;
		const mismatches: { input: string; legacy: string; current: string }[] = [];
		let checked = 0;
		for (const input of ZH_TW_PARITY_SAMPLES) {
			const legacy = tCoreLegacyZhTw(fake, input);
			if (legacy === input) continue; // skip non-translating samples
			checked++;
			const current = tCore(fake, input);
			if (legacy !== current) mismatches.push({ input, legacy, current });
		}
		if (checked === 0) return { ok: false, checked, mismatches, reason: "no translating samples" };
		return { ok: mismatches.length === 0, checked, mismatches };
	} catch (e) {
		return { ok: false, checked: 0, mismatches: [], reason: String(e) };
	}
}

function tCoreLegacyZhTw(i18n: I18nApi, msg: string): string {
	if (!isZhTw(i18n.getLocale())) return msg;

	const s = String(msg ?? "");
	if (CORE_FULL_SCAN_ANCHORS.length < 0) return s;

	// High-confidence exact matches
	const exact: Record<string, string> = {
		// existing core status
		"Forked to new session": "已分岔到新工作階段",
		"Branched to new session": "已分岔到新工作階段",
		"Resumed session": "已恢復工作階段",
		"Resume cancelled": "已取消恢復",
		"Resumed session in current cwd": "已在目前資料夾恢復工作階段",
		"Navigated to selected point": "已前往選取的位置",
		"Navigation cancelled": "已取消導覽",
		"Branch summarization cancelled": "已取消分支摘要",
		"Nothing to compact (no messages yet)": "沒有可壓縮內容（尚無訊息）",
		"Compaction cancelled": "已取消壓縮",
		"Auto-compaction cancelled": "已取消自動壓縮",
		"No entries in session": "此工作階段沒有任何項目",
		"No messages to fork from": "沒有可用於分岔的訊息",
		"No queued messages to restore": "沒有可恢復的佇列訊息",
		"Current model does not support thinking": "目前模型不支援思考模式",
		"No models available": "沒有可用的模型",
		"Queued message for after compaction": "已將訊息加入佇列（壓縮後送出）",
		"Reloaded keybindings, extensions, skills, prompts, themes": "已重新載入：鍵位、擴充、技能、提示、主題",
		"Wait for the current response to finish before reloading.": "請等待目前回覆完成後再重新載入。",
		"Wait for compaction to finish before reloading.": "請等待壓縮完成後再重新載入。",
		"Suspend to background is not supported on Windows": "Windows 不支援背景掛起",
		"GitHub CLI is not logged in. Run 'gh auth login' first.": "GitHub CLI 尚未登入，請先執行 'gh auth login'。",
		"No OAuth providers logged in. Use /login first.": "沒有已登入的 OAuth 供應商，請先使用 /login。",

		// selector/settings/core UI
		"(cancelled)": "（已取消）",
		"Branch summary (": "分支摘要（",
		"branch summary": "分支摘要",
		"[branch summary]: ": "[分支摘要]：",
		"Summarize branch?": "要摘要分支嗎？",
		"No summary": "不摘要",
		"Summarize": "摘要",
		"Summarize with custom prompt": "使用自訂提示摘要",
		"Custom summarization instructions": "自訂摘要指示",
		"Summarizing branch... (escape to cancel)": "正在摘要分支...（escape 可取消）",
		" to expand)": "可展開）",
		"Resource Configuration": "資源設定",
		"Type to filter resources": "輸入以篩選資源",
		"  No resources found": "  找不到資源",
		"pi has joined Earendil": "pi 已加入 Earendil",
		"Read the blog post:": "閱讀部落格文章：",
		"  No matching models": "  找不到符合的模型",
		" ✓ logged in": " ✓ 已登入",
		"Model Configuration": "模型設定",
		"Session-only. Ctrl+S to save to settings.": "僅限本次。Ctrl+S 儲存設定。",
		"(unsaved)": "（未儲存）",
		"re:<pattern> regex · \"phrase\" exact": "re:<pattern> 正規表示式 · \"phrase\" 精確比對",
		"Rename Session": "重新命名工作階段",
		"  Enter to select · Esc to go back": "  Enter 選取 · Esc 返回",
		"Auto-compact": "自動壓縮",
		"Automatically compact context when it gets too large": "上下文過大時自動壓縮",
		"Steering mode": "引導模式",
		"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.": "串流期間按 Enter 會將引導訊息排入佇列。'one-at-a-time'：逐則送出並等待回應；'all'：一次送出全部。",
		"Follow-up mode": "後續訊息模式",
		"Alt+Enter queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.": "Alt+Enter 會在代理停止前持續排入後續訊息。'one-at-a-time'：逐則送出並等待回應；'all'：一次送出全部。",
		"Transport": "傳輸方式",
		"Preferred transport for providers that support multiple transports": "對支援多種傳輸的供應商，優先使用此傳輸方式",
		"Hide thinking": "隱藏思考",
		"Hide thinking blocks in assistant responses": "在助理回應中隱藏思考區塊",
		"Cache miss notices": "快取未命中通知",
		"Show transcript notices for significant prompt-cache misses": "顯示重大提示快取未命中的記錄通知",
		"Collapse changelog": "摺疊更新日誌",
		"Show condensed changelog after updates": "更新後顯示精簡版更新日誌",
		"Quiet startup": "安靜啟動",
		"Disable verbose printing at startup": "停用啟動時的詳細輸出",
		"Install telemetry": "安裝遙測",
		"Send an anonymous version/update ping after changelog-detected updates": "在偵測到更新後傳送匿名版本/更新 ping",
		"Double-escape action": "雙擊 Esc 動作",
		"Action when pressing Escape twice with empty editor": "編輯器為空時連按兩次 Esc 的動作",
		"Tree filter mode": "樹狀篩選模式",
		"Default filter when opening /tree": "開啟 /tree 時的預設篩選",
		"Thinking level": "思考等級",
		"Reasoning depth for thinking-capable models": "支援思考模型的推理深度",
		"Theme": "主題",
		"Color theme for the interface": "介面色彩主題",
		"Show images": "顯示圖片",
		"Render images inline in terminal": "在終端機內嵌顯示圖片",
		"Show images inline in terminal": "在終端機內嵌顯示圖片",
		"Auto-resize images": "自動調整圖片大小",
		"Resize large images to 2000x2000 max for better model compatibility": "將大圖調整為最多 2000x2000，以提升模型相容性",
		"Block images": "封鎖圖片",
		"Prevent images from being sent to LLM providers": "避免將圖片傳送至 LLM 供應商",
		"Skill commands": "技能命令",
		"Register skills as /skill:name commands": "將技能註冊為 /skill:name 命令",
		"Show hardware cursor": "顯示硬體游標",
		"Show the terminal cursor while still positioning it for IME support": "顯示終端機游標，同時保留 IME 定位支援",
		"Editor padding": "編輯器內距",
		"Horizontal padding for input editor (0-3)": "輸入編輯器的水平內距（0-3）",
		"Output padding": "輸出內距",
		"Horizontal padding for user messages, assistant messages, and thinking": "使用者訊息、助理訊息與思考的水平內距",
		"Autocomplete max items": "自動完成最大項目數",
		"Max visible items in autocomplete dropdown (3-20)": "自動完成下拉清單可見項目上限（3-20）",
		"Clear on shrink": "縮小時清除空白列",
		"Clear empty rows when content shrinks (may cause flicker)": "內容縮小時清除空白列（可能閃爍）",
		"Yes": "是",
		"No": "否",
		"Show text placeholder instead": "改為顯示文字佔位",
		"  No entries found": "  找不到項目",
		"user: ": "使用者：",
		"assistant: ": "助理：",
		"(aborted)": "（已中止）",
		"(no content)": "（無內容）",
		"[branch summary]: ": "[分支摘要]：",
		"[title: ": "[標題：",
		"  Session Tree": "  工作階段樹",
		"  No user messages found": "  找不到使用者訊息",
		"Branch from Message": "從訊息建立分支",
		"Select a message to create a new branch from that point": "選擇一則訊息，從該點建立新分支",
		"Working...": "處理中...",
		"Thinking...": "思考中...",
		"What's New": "新功能",
		"to delete to end": "刪除到行尾",
		"Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.": "Pi 可以說明自身功能並查閱文件。你可以詢問如何使用或擴充 Pi。",
		"... (widget truncated)": "...（小工具內容已截斷）",
		"A bash command is already running. Press Esc to cancel it first.": "已有 bash 命令執行中。請先按 Esc 取消。",
		"No editor configured. Set $VISUAL or $EDITOR environment variable.": "尚未設定編輯器。請設定 $VISUAL 或 $EDITOR 環境變數。",
		"Changelog: ": "更新日誌：",
		"Package updates are available. Run ": "有可用套件更新。請執行 ",
		"Model selection saved to settings": "模型選擇已儲存到設定",
		"Already at this point": "已在此節點",
		"Reloading keybindings, extensions, skills, prompts, themes...": "重新載入鍵位、擴充、技能、提示與主題中...",
		"Usage: /import <path.jsonl>": "使用方式：/import <path.jsonl>",
		"Import cancelled": "已取消匯入",
		"GitHub CLI (gh) is not installed. Install it from https://cli.github.com/": "尚未安裝 GitHub CLI（gh）。請至 https://cli.github.com/ 安裝。",
		"Share cancelled": "已取消分享",
		"Failed to parse gist ID from gh output": "無法從 gh 輸出解析 gist ID",
		"No agent messages to copy yet.": "尚無可複製的助理訊息。",
		"Copied last agent message to clipboard": "已將上一則助理訊息複製到剪貼簿",
		"Usage: /name <name>": "使用方式：/name <name>",
		"Keyboard Shortcuts": "鍵盤快捷鍵",
		"Navigation": "導覽",
		"Editing": "編輯",
		"Other": "其他",
		"Extensions": "擴充功能",
		"Key": "按鍵",
		"Action": "動作",
		"Select provider to login:": "選擇要登入的供應商：",
		"Compacting Context": "正在壓縮上下文",
		"Operation aborted": "操作已中止",
		"Scope: all | scoped": "範圍：全部 | 已篩選",
		"  No settings available": "  沒有可用設定",
		"  No matching settings": "  找不到符合的設定",

		// chucknorris extension strings
		"Chuck rejected the state file. It apologized.": "Chuck 拒絕了狀態檔，還順便道歉。",
		"Chuck can't find his joke file.": "Chuck 找不到他的笑話檔。",
		"Chuck failed to load jokes file.": "Chuck 載入笑話檔失敗。",
		"chuck-toast": "chuck-toast",
		"Chuck: hush": "Chuck：安靜",
		"Chuck: ": "Chuck：",
		"ChuckASM isn't loaded yet. Try /reload.": "ChuckASM 尚未載入，請試試 /reload。",
		"Happy path: /chuck quick | now | nap 4h | wake | status": "順手路徑：/chuck quick | now | nap 4h | wake | status",
		"Alias: /chucknorris ...": "別名：/chucknorris ...",
		"Quick preset applied: on + office + autotune.": "已套用快速預設：on + office + autotune。",
		"Chuck ran out of jokes. Physics is safe… for now.": "Chuck 的笑話用完了。物理定律暫時安全。",
		"Try: /chuck nap 4h  (or 30m, or rnd)": "試試：/chuck nap 4h（或 30m，或 rnd）",
		"Chuck woke up. The internet got quieter.": "Chuck 醒了。網路突然安靜了點。",
		"Chuck off. Silent and deadly.": "Chuck 已關閉。安靜又致命。",
		"Chuck on. Reality updated its terms.": "Chuck 已開啟。現實條款已更新。",
		"Chuck returned to factory settings. Factory got nervous.": "Chuck 已回復出廠設定。工廠開始緊張。",
		"Office mode armed. Chuck will whisper.": "辦公模式啟用。Chuck 會輕聲細語。",
		"Stealth mode engaged. Chuck left no logs.": "潛行模式啟動。Chuck 沒留下任何紀錄。",
		"Unhinged mode engaged. Latency will be judged.": "失控模式啟動。延遲將被審判。",
		"Try: /chuck mode office|stealth|unhinged|default": "試試：/chuck mode office|stealth|unhinged|default",
		"Curfew: off": "宵禁：關",
		"Curfew off. Chuck now works the night shift.": "宵禁已關。Chuck 現在值夜班。",
		"Try: /chuck curfew 22-8  (or /chuck curfew off)": "試試：/chuck curfew 22-8（或 /chuck curfew off）",
		"Curfew hours must be 0..23": "宵禁時段必須在 0..23",
		"Chuck switched back to the default pack.": "Chuck 已切回預設包。",
		"Chuck accepted your new joke pack. The universe sighed.": "Chuck 接受了你的新笑話包。宇宙嘆了一口氣。",
		"Pack reloaded.": "笑話包已重新載入。",
		"No latency samples yet. Ask something slow first.": "尚無延遲樣本。先問點會慢的問題吧。",
		"Autotune on. Chuck now calibrates your patience.": "自動調校已開啟。Chuck 正在校準你的耐心。",
		"Autotune off. Chuck will not adapt. Neither will you.": "自動調校已關閉。Chuck 不會適應，你也不會。",
		"Chuck safe mode: on": "Chuck 安全模式：開",
		"Chuck safe mode: off": "Chuck 安全模式：關",
		"Contribute joke packs: one joke per line, optional [modern]/[classic] tags.": "投稿笑話包：每行一則笑話，可加 [modern]/[classic] 標籤。",
		"If this made you smile, star the repo and share your best pack ✨": "如果你笑了，請幫 repo 點星，並分享你的最佳笑話包 ✨",
		"Unknown Chuck move. Try: /chuck help": "未知的 Chuck 指令。請試試：/chuck help",
		"chucknorris: fun latency-gated thinking toasts": "chucknorris：有趣的延遲門檻思考提示",
		"Alias for /chucknorris": "/chucknorris 的別名",

		// i18n extension strings
		"Show i18n debug info (core-hacks + slash menu)": "顯示 i18n 偵錯資訊（core-hacks + slash 選單）",
		"Toggle best-effort core UI localization hacks": "切換最佳努力的核心 UI 在地化 hacks",
		"core hacks enabled": "core hacks 已啟用",
		"core hacks disabled": "core hacks 已停用",
		"Get current UI locale from pi-di18n": "取得 pi-di18n 目前 UI 語系",

		// govern extension strings
		"Unknown type. Use MARKDOWN|CSHARP|RAZOR|TAILWIND": "未知類型。請使用 MARKDOWN|CSHARP|RAZOR|TAILWIND",
		"doctor markdown skipped: ${plan.skipped.slice(0, 6).map((s) => ": "doctor markdown 略過：${plan.skipped.slice(0, 6).map((s) => ",
		").join(\", \")}": ").join(\", \")}",
		"fix candidate: ${op.path} • MUST ${op.mustBefore.length} -> ${op.mustAfter.length}": "修復候選：${op.path} • MUST ${op.mustBefore.length} -> ${op.mustAfter.length}",
		"next: /gov fix markdown --scope authority --dry-run": "下一步：/gov fix markdown --scope authority --dry-run",
		"usage: /gov rollback <planId>": "用法：/gov rollback <planId>",
		"rollback failed: unknown plan ${planId}": "回滾失敗：未知方案 ${planId}",
		"rollback ${planId}: restored ${restored}/${idx.ops.length}${skipped ? ": "回滾 ${planId}：已還原 ${restored}/${idx.ops.length}${skipped ? ",
		"fix markdown --scope include requires --include \"path1.md,path2.md\"": "fix markdown --scope include requires --include \"path1.md,path2.md\"",
		"/gov fix markdown apply requires --yes": "/gov fix markdown apply 需要 --yes",
		"fix markdown apply blocked: repo not clean (use --allow-dirty to override)": "fix markdown 套用被阻擋：repo 非乾淨（可用 --allow-dirty 覆寫）",
		"fix markdown: no deterministic edits (MUST ${plan.totalMustBefore} -> ${plan.totalMustAfter})": "fix markdown：沒有可確定性套用的編輯（MUST ${plan.totalMustBefore} -> ${plan.totalMustAfter}）",
		"fix markdown plan ${plan.planId}: ${plan.ops.length} file(s) • MUST ${plan.totalMustBefore} -> ${plan.totalMustAfter}": "fix markdown 計畫 ${plan.planId}：${plan.ops.length} 個檔案 • MUST ${plan.totalMustBefore} -> ${plan.totalMustAfter}",
		"- ${op.path}: MUST ${op.mustBefore.length} -> ${op.mustAfter.length}": "- ${op.path}：MUST ${op.mustBefore.length} -> ${op.mustAfter.length}",
		"dry-run only. run: /gov fix markdown --apply --yes": "僅 dry-run。請執行：/gov fix markdown --apply --yes",
		"fix markdown applied ${applied}/${plan.ops.length} file(s)${blocked > 0 ? ": "fix markdown 已套用 ${applied}/${plan.ops.length} 個檔案${blocked > 0 ? ",
		"backup: ${backupRoot}": "備份：${backupRoot}",
		"Unknown strategy. Use strict|balanced": "未知策略。請使用 strict|balanced",
		"classify unknown (${strategy}) dry-run: ${selected.length} candidate(s)": "classify unknown (${strategy}) dry-run：${selected.length} 個候選",
		"run /gov classify unknown --strategy ": "執行 /gov classify unknown --strategy ",
		" --apply --yes to persist governed state": " --apply --yes 以持久化 governed 狀態",
		"/gov classify unknown apply requires --yes": "/gov classify unknown apply 需要 --yes",
		"enforce global enabled": "全域 enforce 已啟用",
		"Govern guided recovery": "Govern 引導式復原",
		"Run guided recovery now (markdown-first, then full-type)?": "現在執行引導式復原嗎（先 markdown，再 full-type）？",
		"stage 1/2: markdown-only enforcement enabled": "第 1/2 階段：已啟用僅 markdown enforcement",
		"Apply markdown fixes": "套用 markdown 修正",
		"Apply deterministic markdown fixes now?": "現在套用可確定的 markdown 修正嗎？",
		"Proceed to full-type recovery": "繼續 full-type 復原",
		"Enable CSHARP/RAZOR/TAILWIND and continue recovery?": "啟用 CSHARP/RAZOR/TAILWIND 並繼續復原嗎？",
		"stage 2/2: full-type enforcement enabled": "第 2/2 階段：已啟用 full-type enforcement",
		"stage 1/2: markdown-only": "第 1/2 階段：僅 markdown",
		"stage 2/2: full-type enforcement": "第 2/2 階段：full-type enforcement",
		"classify unknown (strict): applying ${selected.length} candidate(s)": "classify unknown（strict）：正在套用 ${selected.length} 個候選",
		"one-pass guided recovery complete": "一次通過的引導式復原完成",
		"Classify unknown (dry-run)": "Classify unknown（dry-run）",
		"Run strict unknown classification dry-run now?": "現在執行 strict unknown classification dry-run 嗎？",
		"classify unknown (strict) dry-run: ${selected.length} candidate(s)": "classify unknown（strict）dry-run：${selected.length} 個候選",
		"Apply unknown classification": "套用 unknown classification",
		"Persist strict unknown classification now?": "現在持久化 strict unknown classification 嗎？",
		"guided recovery complete": "引導式復原完成",

		// igotchu strings
		"igotchu: no available prediction model": "igotchu：沒有可用的預測模型",
		"95+ cheap-model predictive prefill with one-key injected delete": "95+ 低成本模型預測預填，支援一鍵注入刪除",
		"igotchu enabled": "igotchu 已啟用",
		"igotchu disabled": "igotchu 已停用",
		"Usage: /igotchu threshold <50-99>": "使用方式：/igotchu threshold <50-99>",
		"Usage: /igotchu model pin <provider/model>": "使用方式：/igotchu model pin <provider/model>",
		"Pinned model is not available/authenticated": "釘選模型不可用或未通過驗證",
		"Usage: /igotchu model show|auto|pin <provider/model>": "使用方式：/igotchu model show|auto|pin <provider/model>",
		"No active model selected for deep assist": "尚未選擇可用於深度輔助的模型",
		"Type something first, then run /igotchu deep": "請先輸入一些內容，再執行 /igotchu deep",
		"Deep assist returned no prediction": "深度輔助未回傳預測",
		"Deep assist returned empty continuation": "深度輔助回傳了空續寫",
		"Reset igotchu?": "要重設 igotchu 嗎？",
		"Clear config + local state + rebuild defaults?": "清除設定與本地狀態，並重建預設值？",
		"igotchu reset complete": "igotchu 重設完成",
		"yo model: ${modelRef(selectedModel)} (${selectedModelReason})": "yo 模型：${modelRef(selectedModel)}（${selectedModelReason}）",
		"yo: no available cheap model": "yo：沒有可用的低成本模型",
		"yo synced (.igotchu.md) [${reason}]": "yo 已同步（.igotchu.md）[${reason}]",
		"yo sync failed: ${lastError}": "yo 同步失敗：${lastError}",
		"yo: drift high — ${suggestion}": "yo：漂移偏高 — ${suggestion}",
		" yo ": " yo ",
		"(Esc/Enter to close)": "（Esc/Enter 關閉）",
		"Drift monitor (cheap-first). Nudges only at confidence>=95. Footer: <glyph> yo": "漂移監測（低成本優先）。僅在 confidence>=95 時提示。Footer：<glyph> yo",
		"show current drift/conf/model": "顯示目前 drift/conf/model",
		"open overlay report": "開啟覆蓋層報告",
		"enable yo": "啟用 yo",
		"disable yo": "停用 yo",
		"write .igotchu.md now": "立即寫入 .igotchu.md",
		"reset runtime state/cooldown": "重設執行期狀態/冷卻",
		"threshold ": "threshold ",
		"set confidence threshold (95-99)": "設定 confidence 閾值（95-99）",
		"nudge ": "nudge ",
		"set drift nudge threshold (0-100)": "設定 drift nudge 閾值（0-100）",
		"model ": "model ",
		"show/auto/pin": "show/auto/pin",
		"manual deep analysis using current chat model": "使用目前聊天模型進行手動深度分析",
		"model show": "model show",
		"show cheap model selection": "顯示低成本模型選擇",
		"model auto": "model auto",
		"auto-select cheap model": "自動選擇低成本模型",
		"model pin ": "model pin ",
		"model pin": "model pin",
		"pin a provider/model": "釘選 provider/model",
		"ctx=${m.contextWindow} maxTok=${m.maxTokens}": "ctx=${m.contextWindow} maxTok=${m.maxTokens}",
		"nudge ${v}": "nudge ${v}",
		"yo enabled": "yo 已啟用",
		"yo disabled": "yo 已停用",
		"Usage: /yo threshold <95-99>": "使用方式：/yo threshold <95-99>",
		"yo threshold set to ${config.threshold}": "yo 閾值已設為 ${config.threshold}",
		"Usage: /yo nudge <0-100>": "使用方式：/yo nudge <0-100>",
		"yo nudge drift threshold set to ${config.nudgeThreshold}": "yo nudge 漂移閾值已設為 ${config.nudgeThreshold}",
		"Usage: /yo model pin <provider/model>": "使用方式：/yo model pin <provider/model>",
		"Usage: /yo model show|auto|pin <provider/model>": "使用方式：/yo model show|auto|pin <provider/model>",
		"No current chat model selected": "尚未選擇目前聊天模型",
		"Reset yo?": "要重設 yo 嗎？",
		"Clear runtime drift history + cooldown (keeps .igotchu.md)": "清除執行期漂移歷史與冷卻（保留 .igotchu.md）",
		"yo reset complete": "yo 重設完成",

		// oneliner
		"oneliner: cycle footer preset (full/compact/ultra)": "oneliner：循環切換 footer 預設（full/compact/ultra）",

		// template anchors (for coverage + fallback)
		"Running... (${keyText(\"tui.select.cancel\")} to cancel)": "執行中…（${keyText(\"tui.select.cancel\")} 可取消）",
		"(exit ${this.exitCode})": "（結束碼 ${this.exitCode}）",
		"Output truncated. Full output: ${this.fullOutputPath}": "輸出已截斷。完整輸出：${this.fullOutputPath}",
		"path ${pathState}": "路徑 ${pathState}",
		"${keyText(\"tui.select.confirm\")} to save · ${keyText(\"tui.select.cancel\")} to cancel": "${keyText(\"tui.select.confirm\")} 儲存 · ${keyText(\"tui.select.cancel\")} 取消",
		" (${keyText(\"app.tools.expand\")} to expand)": "（${keyText(\"app.tools.expand\")} 以展開）",
		"[bash]: ${normalize(bashMsg.command ?? \"\")}": "[bash]：${normalize(bashMsg.command ?? \"\")}",
		"  ↑/↓: move. ←/→: page. ^←/^→ or Alt+←/Alt+→: fold/branch. ${keyText(\"app.tree.editLabel\")}: label. ^D/^T/^U/^L/^A: filters (^O/⇧^O cycle). ${keyText(\"app.tree.toggleLabelTimestamp\")}: label time": "  ↑/↓：移動。←/→：換頁。^←/^→ 或 Alt+←/Alt+→：摺疊/分支。${keyText(\"app.tree.editLabel\")}：標籤。^D/^T/^U/^L/^A：篩選（^O/⇧^O 循環）。${keyText(\"app.tree.toggleLabelTimestamp\")}：標籤時間",
		"Press ${keyText(\"app.tools.expand\")} to show full startup help and loaded resources.": "按 ${keyText(\"app.tools.expand\")} 顯示完整啟動說明與已載入資源。",
		"Migrated credentials to auth.json: ${migratedProviders.join(\", \")}": "已將憑證遷移到 auth.json：${migratedProviders.join(\", \")}",
		"models.json error: ${modelsJsonError}": "models.json 錯誤：${modelsJsonError}",
		"  \"${name}\" collision:": "  \"${name}\" 衝突：",
		"${this.defaultWorkingMessage} (${keyText(\"app.interrupt\")} to interrupt)": "${this.defaultWorkingMessage}（${keyText(\"app.interrupt\")} 可中斷）",
		"@mariozechner/pi-coding-agent": "@mariozechner/pi-coding-agent",
		"↳ ${dequeueHint} to edit all queued messages": "↳ ${dequeueHint} 以編輯所有佇列訊息",
		"Summarizing branch... (${keyText(\"app.interrupt\")} to cancel)": "正在摘要分支...（${keyText(\"app.interrupt\")} 可取消）",
		"nap ${Math.ceil(left / 60000)}m": "小睡 ${Math.ceil(left / 60000)} 分",
		"cool ${Math.ceil(left / 60000)}m": "冷卻 ${Math.ceil(left / 60000)} 分",
		"${t(\"bootstrap.done\", { count: selected.length })} • projected ${statusTextForScore(projected, t)}": "${t(\"bootstrap.done\", { count: selected.length })} • 預估 ${statusTextForScore(projected, t)}",
		"drift warning (anti-drift contract):n${summary}": "漂移警告（反漂移契約）：n${summary}",
		"Govern advisory:n${warnings.slice(0, 3).map((w) => ": "治理建議：n${warnings.slice(0, 3).map((w) => ",
		").join(\"n\")}": ").join(\"n\")}",
		" (${lines} lines)": "（${lines} 行）",
		"lang:${locale}": "語言：${locale}",
		"igotchu synced (.igotchu.md) [${reason}]": "igotchu 已同步（.igotchu.md）[${reason}]",
		"igotchu deep prefill (${Math.round(pred.confidence)})": "igotchu 深度預填（${Math.round(pred.confidence)}）",

		// dynamic template anchors (interactive-mode)
		"  Model Name: ${selected.model.name}": "  模型名稱：${selected.model.name}",
		"Shortcut handler error: ${err instanceof Error ? err.message : String(err)}": "快捷鍵處理錯誤：${err instanceof Error ? err.message : String(err)}",
		"Retry failed after ${event.attempt} attempts: ${event.finalError || \"Unknown error\"}": "重試在 ${event.attempt} 次後失敗：${event.finalError || \"未知錯誤\"}",
		"Session compacted ${times}": "工作階段已壓縮 ${times}",
		"Restored ${restored} queued message${restored > 1 ? \"s\" : \"\"} to editor": "已還原 ${restored} 則佇列訊息到編輯器",
		"Thinking level: ${newLevel}": "思考等級：${newLevel}",
		"Switched to ${result.model.name || result.model.id}${thinkingStr}": "已切換至 ${result.model.name || result.model.id}${thinkingStr}",
		"Thinking blocks: ${this.hideThinkingBlock ? \"hidden\" : \"visible\"}": "思考區塊：${this.hideThinkingBlock ? \"已隱藏\" : \"可見\"}",
		"Error: ${errorMessage}": "錯誤：${errorMessage}",
		"Warning: ${warningMessage}": "警告：${warningMessage}",
		"New version ${newVersion} is available. ": "有可用新版本 ${newVersion}。",
		"${APP_NAME} update": "${APP_NAME} 更新",
		"Steering: ${message}": "引導：${message}",
		"Follow-up: ${message}": "後續：${message}",
		"Failed to send queued message${queuedMessages.length > 1 ? \"s\" : \"\"}: ${error instanceof Error ? error.message : String(error)}": "送出佇列訊息失敗：${error instanceof Error ? error.message : String(error)}",
		"Model: ${model.id}": "模型：${model.id}",
		"Logged out of ${providerName}": "已登出 ${providerName}",
		"Logout failed: ${error instanceof Error ? error.message : String(error)}": "登出失敗：${error instanceof Error ? error.message : String(error)}",
		"Logged in to ${providerName}. Selected ${selectedModel.id}. Credentials saved to ${getAuthPath()}": "已登入 ${providerName}。已選擇 ${selectedModel.id}。憑證已儲存到 ${getAuthPath()}",
		"Logged in to ${providerName}. Credentials saved to ${getAuthPath()}": "已登入 ${providerName}。憑證已儲存到 ${getAuthPath()}",
		"Failed to login to ${providerName}: ${errorMsg}": "登入 ${providerName} 失敗：${errorMsg}",
		"Reload failed: ${error instanceof Error ? error.message : String(error)}": "重新載入失敗：${error instanceof Error ? error.message : String(error)}",
		"Session exported to: ${filePath}": "工作階段已匯出至：${filePath}",
		"Failed to export session: ${error instanceof Error ? error.message : \"Unknown error\"}": "匯出工作階段失敗：${error instanceof Error ? error.message : \"未知錯誤\"}",
		"Session imported from: ${inputPath}": "工作階段已從此匯入：${inputPath}",
		"Failed to import session: ${error.message}": "匯入工作階段失敗：${error.message}",
		"Failed to create gist: ${errorMsg}": "建立 gist 失敗：${errorMsg}",
		"Share URL: ${previewUrl}nGist: ${gistUrl}": "分享網址：${previewUrl}nGist：${gistUrl}",
		"Failed to create gist: ${error instanceof Error ? error.message : \"Unknown error\"}": "建立 gist 失敗：${error instanceof Error ? error.message : \"未知錯誤\"}",
		"Session name: ${currentName}": "工作階段名稱：${currentName}",
		"Session name set: ${name}": "工作階段名稱已設定：${name}",
		"Bash command failed: ${error instanceof Error ? error.message : \"Unknown error\"}": "Bash 命令失敗：${error instanceof Error ? error.message : \"未知錯誤\"}",
	};
	if (exact[s]) return exact[s];

	let out = s;

	// High-confidence patterns
	out = out.replace(/^Error: (.+)$/i, (_m, err) => `錯誤：${err}`);
	out = out.replace(/^Warning: (.+)$/i, (_m, warn) => `警告：${warn}`);
	out = out.replace(/^Running\.\.\. \((.+) to cancel\)$/i, (_m, key) => `執行中…（${key} 可取消）`);
	out = out.replace(/^Compacting context\.\.\. \((.+) to cancel\)$/i, (_m, key) => `正在壓縮上下文...（${key} 可取消）`);
	out = out.replace(/^Auto-compacting\.\.\. \((.+) to cancel\)$/i, (_m, key) => `自動壓縮中...（${key} 可取消）`);
	out = out.replace(/^Context overflow detected, Auto-compacting\.\.\. \((.+) to cancel\)$/i, (_m, key) => `偵測到上下文溢位，自動壓縮中...（${key} 可取消）`);
	out = out.replace(/^\(exit (.+)\)$/i, (_m, code) => `（結束碼 ${code}）`);
	out = out.replace(/^Output truncated\. Full output: (.+)$/i, (_m, p) => `輸出已截斷。完整輸出：${p}`);
	out = out.replace(/^Compacted from (.+) tokens \($/i, (_m, n) => `已從 ${n} tokens 壓縮（`);
	out = out.replace(/^Login to (.+)$/i, (_m, p) => `登入 ${p}`);
	out = out.replace(/^\s*Model Name: (.+)$/i, (_m, name) => `  模型名稱：${name}`);
	out = out.replace(/^\s*Scope:\s*all\s*\|\s*scoped\s*$/i, () => "範圍：全部 | 已篩選");
	out = out.replace(/^\s*tab\s+scope\s*\(all\/filtered\)\s*$/i, () => "tab 範圍（全部/已篩選）");
	out = out.replace(/^\s*Type to search:$/i, () => "輸入以搜尋：");
	out = out.replace(/^\s*Select provider to login:\s*$/i, () => "選擇要登入的供應商：");
	out = out.replace(/^\s*Compacting Context\s*$/i, () => "正在壓縮上下文");
	out = out.replace(/^\s*Operation aborted\s*$/i, () => "操作已中止");
	out = out.replace(/^path (.+)$/i, (_m, st) => `路徑 ${st}`);
	out = out.replace(/^(.+) to save · (.+) to cancel$/i, (_m, k1, k2) => `${k1} 儲存 · ${k2} 取消`);
	out = out.replace(/^ \((.+) to expand\)$/i, (_m, key) => `（${key} 以展開）`);
	out = out.replace(/^\[bash\]: (.+)$/i, (_m, cmd) => `[bash]：${cmd}`);
	out = out.replace(/^\[compaction: (.+)\]$/i, (_m, s1) => `[壓縮：${s1}]`);
	out = out.replace(/^\[model: (.+)\]$/i, (_m, m) => `[模型：${m}]`);
	out = out.replace(/^\[thinking: (.+)\]$/i, (_m, lvl) => `[思考：${lvl}]`);
	out = out.replace(/^\[custom: (.+)\]$/i, (_m, t) => `[自訂：${t}]`);
	out = out.replace(/^\[label: (.+)\]$/i, (_m, l) => `[標籤：${l}]`);
	out = out.replace(/^Press (.+) to show full startup help and loaded resources\.$/i, (_m, key) => `按 ${key} 顯示完整啟動說明與已載入資源。`);
	out = out.replace(/^Migrated credentials to auth\.json: (.+)$/i, (_m, p) => `已將憑證遷移到 auth.json：${p}`);
	out = out.replace(/^models\.json error: (.+)$/i, (_m, e) => `models.json 錯誤：${e}`);
	out = out.replace(/^\s*"(.+)" collision:$/i, (_m, name) => `  "${name}" 衝突：`);
	out = out.replace(/^Shortcut handler error: (.+)$/i, (_m, e) => `快捷鍵處理錯誤：${e}`);
	out = out.replace(/^(.+) \((.+) to interrupt\)$/i, (_m, label, key) => `${tCore(i18n, label)}（${key} 可中斷）`);
	out = out.replace(/^Retry failed after (\d+) attempts: (.+)$/i, (_m, n, err) => `重試在 ${n} 次後失敗：${err}`);
	out = out.replace(/^Session compacted (.+)$/i, (_m, n) => `工作階段已壓縮 ${n}`);
	out = out.replace(/^Restored (\d+) queued messages? to editor$/i, (_m, n) => `已還原 ${n} 則佇列訊息到編輯器`);
	out = out.replace(/^Thinking level: (.+)$/i, (_m, lvl) => `思考等級：${lvl}`);
	out = out.replace(/^Model: (.+)$/i, (_m, m) => `模型：${m}`);
	out = out.replace(/^Thinking blocks: (hidden|visible)$/i, (_m, state) => `思考區塊：${state === "hidden" ? "已隱藏" : "可見"}`);
	out = out.replace(/^Switched to (.+)$/i, (_m, rest) => `已切換至 ${rest}`);
	out = out.replace(/^New version (.+) is available\.\s*$/i, (_m, v) => `有可用新版本 ${v}。`);
	out = out.replace(/^(.+) update$/i, (_m, name) => `${name} 更新`);
	out = out.replace(/^Steering: (.+)$/i, (_m, m) => `引導：${m}`);
	out = out.replace(/^Follow-up: (.+)$/i, (_m, m) => `後續：${m}`);
	out = out.replace(/^↳ (.+) to edit all queued messages$/i, (_m, k) => `↳ ${k} 以編輯所有佇列訊息`);
	out = out.replace(/^Failed to send queued messages?: (.+)$/i, (_m, e) => `送出佇列訊息失敗：${e}`);
	out = out.replace(/^Summarizing branch\.\.\. \((.+) to cancel\)$/i, (_m, k) => `正在摘要分支...（${k} 可取消）`);
	out = out.replace(/^Logged out of (.+)$/i, (_m, p) => `已登出 ${p}`);
	out = out.replace(/^Logout failed: (.+)$/i, (_m, e) => `登出失敗：${e}`);
	out = out.replace(/^Logged in to (.+)\. Selected (.+)\. Credentials saved to (.+)$/i, (_m, p, m, path) => `已登入 ${p}。已選擇 ${m}。憑證已儲存到 ${path}`);
	out = out.replace(/^Logged in to (.+)\. Credentials saved to (.+)$/i, (_m, p, path) => `已登入 ${p}。憑證已儲存到 ${path}`);
	out = out.replace(/^Failed to login to (.+): (.+)$/i, (_m, p, e) => `登入 ${p} 失敗：${e}`);
	out = out.replace(/^Reload failed: (.+)$/i, (_m, e) => `重新載入失敗：${e}`);
	out = out.replace(/^Session exported to: (.+)$/i, (_m, p) => `工作階段已匯出至：${p}`);
	out = out.replace(/^Failed to export session: (.+)$/i, (_m, e) => `匯出工作階段失敗：${e}`);
	out = out.replace(/^Session imported from: (.+)$/i, (_m, p) => `工作階段已從此匯入：${p}`);
	out = out.replace(/^Failed to import session: (.+)$/i, (_m, e) => `匯入工作階段失敗：${e}`);
	out = out.replace(/^Failed to create gist: (.+)$/i, (_m, e) => `建立 gist 失敗：${e}`);
	out = out.replace(/^Share URL: (.+)\nGist: (.+)$/i, (_m, u, g) => `分享網址：${u}\nGist：${g}`);
	out = out.replace(/^\s*Session name: (.+)$/i, (_m, n) => `工作階段名稱：${n}`);
	out = out.replace(/^\s*Session name set: (.+)$/i, (_m, n) => `工作階段名稱已設定：${n}`);
	out = out.replace(/Session name:\s*/gi, "工作階段名稱：");
	out = out.replace(/Session name set:\s*/gi, "工作階段名稱已設定：");
	out = out.replace(/^Bash command failed: (.+)$/i, (_m, e) => `Bash 命令失敗：${e}`);
	out = out.replace(/^nap (\d+)m$/i, (_m, m) => `小睡 ${m} 分`);
	out = out.replace(/^cool (\d+)m$/i, (_m, m) => `冷卻 ${m} 分`);
	out = out.replace(/^ChuckASM failed to load: (.+)$/i, (_m, e) => `ChuckASM 載入失敗：${e}`);
	out = out.replace(/^Chuck is napping for (\d+)m\.$/i, (_m, m) => `Chuck 正在小睡 ${m} 分鐘。`);
	out = out.replace(/^Chuck mode: (.+)$/i, (_m, name) => `Chuck 模式：${name}`);
	out = out.replace(/^Curfew: (\d+)-(\d+)$/i, (_m, s1, s2) => `宵禁：${s1}-${s2}`);
	out = out.replace(/^Curfew set: (\d+)-(\d+)\. Chuck will keep it quiet then\.$/i, (_m, s1, s2) => `宵禁已設定：${s1}-${s2}。Chuck 屆時會保持安靜。`);
	out = out.replace(/^Autotune: (on|off) \(use \/chuck tune on\|off\)$/i, (_m, state) => `自動調校：${state === "on" ? "開" : "關"}（使用 /chuck tune on|off）`);
	out = out.replace(/^Chuck safe mode: (on|off) \(use \/chuck safe on\|off\)$/i, (_m, state) => `Chuck 安全模式：${state === "on" ? "開" : "關"}（使用 /chuck safe on|off）`);
	out = out.replace(/^drift warning \(anti-drift contract\):\n(.+)$/i, (_m, body) => `漂移警告（反漂移契約）：\n${body}`);
	out = out.replace(/^core hacks failed: (.+)$/i, (_m, r) => `core hacks 失敗：${r}`);
	out = out.replace(/^core hacks disable failed: (.+)$/i, (_m, r) => `停用 core hacks 失敗：${r}`);
	out = out.replace(/^ \((\d+) lines\)$/i, (_m, n) => `（${n} 行）`);
	out = out.replace(/^lang:(.+)$/i, (_m, l) => `語言：${l}`);
	out = out.replace(/^igotchu model: (.+) \((.+)\)$/i, (_m, model, why) => `igotchu 模型：${model}（${why}）`);
	out = out.replace(/^igotchu synced \(\.igotchu\.md\) \[(.+)\]$/i, (_m, reason) => `igotchu 已同步（.igotchu.md）[${reason}]`);
	out = out.replace(/^igotchu sync failed: (.+)$/i, (_m, e) => `igotchu 同步失敗：${e}`);
	out = out.replace(/^igotchu on • threshold (\d+) • model (.+)$/i, (_m, th, model) => `igotchu 已啟用 • 閾值 ${th} • 模型 ${model}`);
	out = out.replace(/^igotchu threshold set to (\d+)$/i, (_m, n) => `igotchu 閾值已設為 ${n}`);
	out = out.replace(/^igotchu deep prefill \((\d+)\)$/i, (_m, c) => `igotchu 深度預填（${c}）`);
	out = out.replace(/^yo model: (.+) \((.+)\)$/i, (_m, model, why) => `yo 模型：${model}（${why}）`);
	out = out.replace(/^yo synced \(\.igotchu\.md\) \[(.+)\]$/i, (_m, reason) => `yo 已同步（.igotchu.md）[${reason}]`);
	out = out.replace(/^yo sync failed: (.+)$/i, (_m, e) => `yo 同步失敗：${e}`);
	out = out.replace(/^yo threshold set to (\d+)$/i, (_m, n) => `yo 閾值已設為 ${n}`);
	out = out.replace(/^yo nudge drift threshold set to (\d+)$/i, (_m, n) => `yo nudge 漂移閾值已設為 ${n}`);
	out = out.replace(/^rollback failed: unknown plan (.+)$/i, (_m, id) => `回滾失敗：未知方案 ${id}`);
	out = out.replace(/^classify unknown \((.+)\) dry-run: (\d+) candidate\(s\)$/i, (_m, s1, n) => `classify unknown（${s1}）dry-run：${n} 個候選`);
	out = out.replace(/^fix markdown plan (.+): (\d+) file\(s\) • MUST (\d+) -> (\d+)$/i, (_m, id, files, b, a) => `fix markdown 計畫 ${id}：${files} 個檔案 • MUST ${b} -> ${a}`);
	out = out.replace(/^fix markdown applied (\d+)\/(\d+) file\(s\)(.*)$/i, (_m, x, y, rest) => `fix markdown 已套用 ${x}/${y} 個檔案${rest}`);
	out = out.replace(/^classify unknown \(strict\): applying (\d+) candidate\(s\)$/i, (_m, n) => `classify unknown（strict）：正在套用 ${n} 個候選`);

	// session report + compaction status (multiline-safe)
	out = out.replace(/\bSession Info\b/g, "工作階段資訊");
	out = out.replace(/\bMessages\b/g, "訊息");
	out = out.replace(/\bCost\b/g, "成本");
	out = out.replace(/\bName:\s/g, "名稱：");
	out = out.replace(/\bFile:\s/g, "檔案：");
	out = out.replace(/\bID:\s/g, "ID：");
	out = out.replace(/\bUser:\s/g, "使用者：");
	out = out.replace(/\bAssistant:\s/g, "助理：");
	out = out.replace(/\bTool Calls:\s/g, "工具呼叫：");
	out = out.replace(/\bTool Results:\s/g, "工具結果：");
	out = out.replace(/\bTools:\s/g, "工具：");
	out = out.replace(/\bTokens\b/g, "令牌");
	out = out.replace(/\bInput:\s/g, "輸入：");
	out = out.replace(/\bOutput:\s/g, "輸出：");
	out = out.replace(/\bCache Read:\s/g, "快取讀取：");
	out = out.replace(/\bCache Write:\s/g, "快取寫入：");
	out = out.replace(/\bCached:\s/g, "已快取：");
	out = out.replace(/\bUncached:\s/g, "未快取：");
	out = out.replace(/\bCache Re-billed:\s/g, "快取重新計費：");
	out = out.replace(/(\d[\d,]*)\s+calls,\s*(\d[\d,]*)\s+results/g, "$1 次呼叫，$2 個結果");
	out = out.replace(/(\d[\d,]*)\s+written to cache/g, "$1 已寫入快取");
	out = out.replace(/(\d[\d,]*)\s+tokens,\s*(\d+)\s+miss(?:es)?/g, "$1 令牌，$2 次未命中");
	out = out.replace(/\bTotal:\s/g, "總計：");
	out = out.replace(/Compacting context\.\.\. \(escape to cancel\)/gi, "正在壓縮上下文...（Esc 可取消）");

	// govern extension patterns
	out = out.replace(/^Govern advisory:\n?([\s\S]+)$/i, (_m, body) => `治理建議：\n${body}`);
	out = out.replace(/^enforce global: (on|off)\n([\s\S]+)$/i, (_m, state, rows) => `全域 enforce：${state === "on" ? "開" : "關"}\n${rows}`);
	out = out.replace(/^enforce global (enabled|disabled)$/i, (_m, mode) => `全域 enforce ${mode === "enabled" ? "已啟用" : "已停用"}`);
	out = out.replace(/^enforce (.+) (enabled|disabled)$/i, (_m, ty, mode) => `enforce ${ty} ${mode === "enabled" ? "已啟用" : "已停用"}`);

	return out;
}

function tUiLine(i18n: I18nApi, line: string): string {
	const input = String(line ?? "");
	const translated = tSelector(i18n, tCore(i18n, input));
	if (translated === input) return translated;

	// Keep translated UI lines within the original rendered width so localization
	// cannot overflow a line that the upstream component already sized and truncated.
	// This is especially important for narrow terminals and wide translations.
	if (!translated.includes("\n")) {
		const inputWidth = visibleWidth(input);
		if (inputWidth >= 0 && visibleWidth(translated) > inputWidth) {
			return truncateToWidth(translated, inputWidth, "…");
		}
	}
	return translated;
}

export function translateUiLineForTest(i18n: I18nApi, line: string): string {
	const input = String(line ?? "");
	return tSelector(i18n, tCore(i18n, input));
}

function stripAnsiForMatch(input: string): string {
	return String(input ?? "")
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function postprocessZhCnUiLine(line: string): string {
	let s = String(line ?? "");
	const plain = stripAnsiForMatch(s).trim();
	const selectedPrefix = plain.startsWith("→ ") ? "→ " : "";
	const rowPrefix = selectedPrefix || "  ";
	const plainBody = plain.replace(/^→\s*/, "");

	if (/^(?:Scope:|范围：)\s*all\s*\|\s*scoped$/i.test(plain)) return "范围：全部 | 已筛选";
	if (/^tab\s+scope(?:\s*\((?:all\/scoped|all\/filtered)\)|（全部\/已筛.*）?)$/i.test(plain)) return "tab 范围（全/筛）";
	{
		const m = plainBody.match(/^Model\s+(?:Name|名称)[:：]\s*(.+)$/i);
		if (m) return `${rowPrefix}模型：${m[1]}`;
	}
	const boolLabels = new Set([
		"自动压缩",
		"自动调整图片大小",
		"屏蔽图片",
		"技能命令",
		"显示硬件光标",
		"收缩时清除",
		"终端进度",
		"隐藏思考",
		"折叠更新日志",
		"安静启动",
		"安装遥测",
		"缓存未命中提示",
	]);
	const settingsRowLabels = new Set([
		"自动压缩",
		"自动调整图片大小",
		"屏蔽图片",
		"技能命令",
		"显示硬件光标",
		"编辑器内距",
		"输出内距",
		"自动完成最大项目数",
		"收缩时清除",
		"终端进度",
		"引导模式",
		"后续消息模式",
		"传输方式",
		"HTTP 空闲超时",
		"隐藏思考",
		"折叠更新日志",
		"安静启动",
		"安装遥测",
		"缓存未命中提示",
		"默认项目可信策略",
		"双击 Esc 动作",
		"树状筛选模式",
		"警告",
		"思考等级",
		"主题",
	]);
	for (const label of Array.from(settingsRowLabels).sort((a, b) => b.length - a.length)) {
		if (!plainBody.startsWith(label)) continue;
		const rawRest = plainBody.slice(label.length);
		if (/^\s*[：:]/.test(rawRest)) continue;
		const value = rawRest.trim();
		if (!value) continue;
		let out = value;
		if (/^(true|false)$/i.test(value) && boolLabels.has(label)) out = value.toLowerCase() === "true" ? "开" : "关";
		else if ((label === "引导模式" || label === "后续消息模式") && /^all$/i.test(value)) out = "全部";
		else if (label === "传输方式" && /^auto$/i.test(value)) out = "自动";
		else if (label === "默认项目可信策略" && /^Ask$/i.test(value)) out = "问";
		else if (label === "默认项目可信策略" && /^Always trust$/i.test(value)) out = "始终信任";
		else if (label === "默认项目可信策略" && /^Never trust$/i.test(value)) out = "永不信任";
		else if (label === "警告" && /^configure$/i.test(value)) out = "配置";
		else if (label === "双击 Esc 动作" && /^tree$/i.test(value)) out = "会话树";
		else if (label === "树状筛选模式" && /^default$/i.test(value)) out = "默认";
		else if (label === "思考等级" && /^high$/i.test(value)) out = "高";
		else if (label === "主题" && /^light\/dark$/i.test(value)) out = "明/暗";
		return `${rowPrefix}${label} ${out}`;
	}
	if (/^↑↓\s+navigate\s+enter\s+select\s+escape\/ctrl\+c\s+cancel$/i.test(plainBody)) {
		return `${rowPrefix}↑↓ 导航  enter 选择  escape/ctrl+c 取消`;
	}
	if (/^↑↓\s+navigate\s+enter\s+save\s+escape\/ctrl\+c\s+cancel$/i.test(plainBody)) {
		return `${rowPrefix}↑↓ 导航  enter 保存  escape/ctrl+c 取消`;
	}
	if (/^tab scope\b.*(?:re:<pattern> regex .*exact|re:<模式> 正则 .*精确)$/i.test(plainBody)) {
		return `${rowPrefix}tab 范围 · re:<模式> 正则 · "短语" 精确`;
	}
	{
		const m = plainBody.match(/^Resume Session \((?:Current Folder|Current Fold|Curren|All)\)?\s+(.+)$/i);
		if (m) {
			let rest = m[1] ?? "";
			rest = rest.replace(/\bLoading\b/g, "加载中");
			rest = rest.replace(/名称：\s*All/g, "名称： 全部");
			rest = rest.replace(/\|\s*○\s*All/g, "| ○ 全部");
			return `恢复会话（当前文件夹） ${rest}`;
		}
	}
	if (/^ctrl\+s sort · ctrl\+n named · ctrl\+d delete · ctrl\+p path \(off\) · ctrl\+r rename$/i.test(plainBody)) {
		return `${rowPrefix}ctrl+s 排序 · ctrl+n 命名 · ctrl+d 删除 · ctrl+p 路径（关） · ctrl+r 重命名`;
	}

	s = s.replace(/^[\t ]*Scope:\s*all\s*\|\s*scoped\s*$/i, () => "范围：全部 | 已筛选");
	s = s.replace(/^[\t ]*tab\s+scope\s*\[[0-9;]*m?\s*\((?:all\/scoped|all\/filtered)\)\s*$/i, () => "tab 范围（全/筛）");
	s = s.replace(/^[\t ]*tab\s+scope\s*\((?:all\/scoped|all\/filtered)\)\s*$/i, () => "tab 范围（全/筛）");
	s = s.replace(/^[\t ]*Model\s+Name[:：]\s*(.+)$/i, (_m, name) => `模型：${name}`);
	s = s.replace(/^[\t ]*Model\s+名称[:：]\s*(.+)$/i, (_m, name) => `模型：${name}`);

	s = s.replaceAll("Only showing models with configured API keys (see README for details)", "仅显示已配置 API 密钥的模型（详见 README）");
	s = s.replaceAll("Only showing models from configured providers. Use /login to add providers.", "仅显示来自已配置提供方的模型。使用 /login 添加提供方。");
	s = s.replaceAll("Resume Session (Current Folder)", "恢复会话（当前文件夹）");
	s = s.replaceAll("Resume Session (All)", "恢复会话（全部）");
	s = s.replace(/Resume Session \((?:Current Fold|Curren)\b/g, "恢复会话（当前文件夹）");
	s = s.replace(/Resume Session \(All\b/g, "恢复会话（全部）");
	s = s.replaceAll("No sessions in current folder. Press Tab to view all.", "当前文件夹中没有会话。按 Tab 查看全部。");
	s = s.replaceAll("No sessions found", "未找到会话");
	s = s.replaceAll("Loading", "加载中");
	s = s.replaceAll("名称： All", "名称： 全部");
	s = s.replace(/名称：\s*All/g, "名称： 全部");
	s = s.replaceAll("| ○ All", "| ○ 全部");

	// Pi 0.80 /session cache breakdown. Keep the numeric context in each pattern
	// so ordinary core UI such as changelog prose is never rewritten.
	s = s.replace(/(\d[\d,]*)\s+calls,\s*(\d[\d,]*)\s+results/g, "$1 次调用，$2 个结果");
	s = s.replace(/(\d[\d,]*)\s+written to cache/g, "$1 已写入缓存");
	s = s.replace(/(\d[\d,]*)\s+tokens,\s*(\d+)\s+miss(?:es)?/g, "$1 令牌，$2 次未命中");

	s = s.replace(/导出会话失败：\s+/g, "导出会话失败：");
	s = s.replaceAll("Scope: ", "范围：");
	s = s.replaceAll(" (all/scoped)", "（全部/已筛选）");
	s = s.replaceAll(" (all/filtered)", "（全部/已筛选）");

	s = s.replaceAll("Default project trust", "默认项目可信策略");
	s = s.replaceAll("Fallback behavior when no extension or saved trust decision decides project trust", "当没有扩展或已保存的信任决策决定项目可信状态时的兜底行为");
	s = s.replaceAll("Warnings", "警告");
	s = s.replaceAll("Enable or disable individual warnings", "启用或禁用单项警告");
	s = s.replaceAll("Image width", "图片宽度");
	s = s.replaceAll("Preferred inline image width in terminal cells", "终端单元格中的首选内联图片宽度");
	s = s.replaceAll("Prevent images from being sent to LLM providers", "阻止将图片发送给 LLM 提供方");

	s = s.replace(/^默认项目可信策略\s+Ask$/i, "默认项目可信策略 问");
	s = s.replace(/^默认项目可信策略\s+Always trust$/i, "默认项目可信策略 始终信任");
	s = s.replace(/^默认项目可信策略\s+Never trust$/i, "默认项目可信策略 永不信任");
	s = s.replace(/^警告\s+configure$/i, "警告 配置");
	s = s.replace(/^双击 Esc 动作\s+tree$/i, "双击 Esc 动作 会话树");
	s = s.replace(/^树状筛选模式\s+default$/i, "树状筛选模式 默认");
	s = s.replace(/^思考等级\s+high$/i, "思考等级 高");
	s = s.replace(/^主题\s+light\/dark$/i, "主题 明/暗");
	s = s.replace(/^\s*Error:\s*/i, "错误：");
	s = s.replace(/^错误：\s+/i, "错误：");
	s = s.replace(/^警告：\s+/i, "警告：");
	const plainAfter = stripAnsiForMatch(s).trim();
	if (/^Error:\s*/i.test(plainAfter)) {
		return plainAfter.replace(/^Error:\s*/i, "错误：").replace(/导出会话失败：\s+/g, "导出会话失败：");
	}

	return s;
}

function tSelectorLegacyZhTw(i18n: I18nApi, line: string): string {
	if (!isZhTw(i18n.getLocale())) return line;
	let s = String(line ?? "");

	// Session selector
	s = s.replaceAll("Resume Session (Current Folder)", "恢復工作階段（目前資料夾）");
	s = s.replaceAll("Resume Session (All)", "恢復工作階段（全部）");
	s = s.replaceAll("Current Folder", "目前資料夾");
	s = s.replaceAll("All", "全部");
	s = s.replaceAll("Sort: ", "排序：");
	s = s.replaceAll("Session Info", "工作階段資訊");
	s = s.replaceAll("Name: ", "名稱：");
	s = s.replaceAll("File: ", "檔案：");
	s = s.replaceAll("ID: ", "ID：");
	s = s.replaceAll("Messages", "訊息");
	s = s.replaceAll("User: ", "使用者：");
	s = s.replaceAll("Assistant: ", "助理：");
	s = s.replaceAll("Tool Calls: ", "工具呼叫：");
	s = s.replaceAll("Tool Results: ", "工具結果：");
	s = s.replaceAll("Input: ", "輸入：");
	s = s.replaceAll("Output: ", "輸出：");
	s = s.replaceAll("Cache Read: ", "快取讀取：");
	s = s.replaceAll("Total: ", "總計：");
	s = s.replaceAll("Cost", "成本");
	s = s.replaceAll("Threaded", "樹狀");
	s = s.replaceAll("Recent", "最近");
	s = s.replaceAll("Fuzzy", "模糊");
	s = s.replaceAll("Loading", "載入中");
	s = s.replaceAll("Delete session? ", "刪除工作階段？ ");
	s = s.replaceAll("regex", "正規表示式");
	s = s.replaceAll("exact", "精確");

	// keyHint descriptions in selectors
	s = s.replaceAll(" confirm", " 確認");
	s = s.replaceAll(" cancel", " 取消");
	s = s.replaceAll(" scope", " 範圍");
	s = s.replaceAll(" sort", " 排序");
	s = s.replaceAll(" named", " 命名");
	s = s.replaceAll("Cycle through the deleted text after pasting", "貼上後循環切換刪除歷史");
	s = s.replace(/\bdelete\b/g, "刪除");
	s = s.replace(/\brename\b/g, "重新命名");
	s = s.replaceAll("path (on)", "路徑（開）");
	s = s.replaceAll("path (off)", "路徑（關）");

	// Model selector
	s = s.replaceAll("Only showing models with configured API keys (see README for details)", "僅顯示已設定 API 金鑰的模型（詳見 README）");
	s = s.replaceAll("Scope: ", "範圍：");
	s = s.replaceAll(" (all/scoped)", "（全部/已篩選）");

	// Settings/model menus (ANSI-safe substring replacements)
	s = s.replaceAll("Resource Configuration", "資源設定");
	s = s.replaceAll("Model Configuration", "模型設定");
	s = s.replaceAll("Session-only. Ctrl+S to save to settings.", "僅限本次。Ctrl+S 儲存設定。");
	s = s.replaceAll("Type to search · Enter/Space to change · Esc to cancel", "輸入以搜尋 · Enter/Space 變更 · Esc 取消");
	s = s.replaceAll("Type to search · Enter/Space to change · Esc to 取消", "輸入以搜尋 · Enter/Space 變更 · Esc 取消");
	s = s.replaceAll("Enter/Space to change · Esc to cancel", "Enter/Space 變更 · Esc 取消");
	s = s.replaceAll("No settings available", "沒有可用設定");
	s = s.replaceAll("No matching settings", "找不到符合的設定");
	s = s.replaceAll("Auto-compact", "自動壓縮");
	s = s.replaceAll("Automatically compact context when it gets too large", "上下文過大時自動壓縮");
	s = s.replaceAll("Steering mode", "引導模式");
	s = s.replaceAll("Follow-up mode", "後續訊息模式");
	s = s.replaceAll("Transport", "傳輸方式");
	s = s.replaceAll("Hide thinking", "隱藏思考");
	s = s.replaceAll("Hide thinking blocks in assistant responses", "在助理回應中隱藏思考區塊");
	s = s.replaceAll("Collapse changelog", "摺疊更新日誌");
	s = s.replaceAll("Quiet startup", "安靜啟動");
	s = s.replaceAll("Install telemetry", "安裝遙測");
	s = s.replaceAll("Double-escape action", "雙擊 Esc 動作");
	s = s.replaceAll("Tree filter mode", "樹狀篩選模式");
	s = s.replaceAll("Thinking level", "思考等級");
	s = s.replaceAll("Theme", "主題");
	s = s.replaceAll("Show images", "顯示圖片");
	s = s.replaceAll("Render images inline in terminal", "在終端機內嵌顯示圖片");
	s = s.replaceAll("Auto-resize images", "自動調整圖片大小");
	s = s.replaceAll("Block images", "封鎖圖片");
	s = s.replaceAll("Skill commands", "技能命令");
	s = s.replaceAll("Show hardware cursor", "顯示硬體游標");
	s = s.replaceAll("Editor padding", "編輯器內距");
	s = s.replaceAll("Autocomplete max items", "自動完成最大項目數");
	s = s.replaceAll("Clear on shrink", "縮小時清除空白列");
	s = s.replaceAll("Thinking Level", "思考等級");
	s = s.replaceAll("Select reasoning depth for thinking-capable models", "選擇支援思考模型的推理深度");
	s = s.replaceAll("Select color theme", "選擇色彩主題");
	s = s.replaceAll("Enter to select · Esc to go back", "Enter 選取 · Esc 返回");
	s = s.replaceAll("No reasoning", "不使用推理");
	s = s.replaceAll("Very brief reasoning (~1k tokens)", "極簡推理（約 1k tokens）");
	s = s.replaceAll("Light reasoning (~2k tokens)", "輕量推理（約 2k tokens）");
	s = s.replaceAll("Moderate reasoning (~8k tokens)", "中度推理（約 8k tokens）");
	s = s.replaceAll("Deep reasoning (~16k tokens)", "深度推理（約 16k tokens）");
	s = s.replaceAll("Maximum reasoning (~32k tokens)", "最大推理（約 32k tokens）");

	// Keyboard shortcuts / help tables
	s = s.replaceAll("Keyboard Shortcuts", "鍵盤快捷鍵");
	s = s.replaceAll("Navigation", "導覽");
	s = s.replaceAll("Editing", "編輯");
	s = s.replaceAll("Other", "其他");
	s = s.replaceAll("Extensions", "擴充功能");
	s = s.replaceAll("Key", "按鍵");
	s = s.replaceAll("Action", "動作");
	s = s.replaceAll("Move cursor / browse history (Up when empty)", "移動游標／瀏覽歷史（輸入框為空時可用上鍵）");
	s = s.replaceAll("Move by word", "按詞移動");
	s = s.replaceAll("Start of line", "移至行首");
	s = s.replaceAll("End of line", "移至行尾");
	s = s.replaceAll("Jump forward to character", "向前跳至字元");
	s = s.replaceAll("Jump backward to character", "向後跳至字元");
	s = s.replaceAll("Scroll by page", "按頁捲動");
	s = s.replaceAll("Send message", "送出訊息");
	s = s.replaceAll("New line (Ctrl+Enter on Windows Terminal)", "換行（Windows Terminal 使用 Ctrl+Enter）");
	s = s.replaceAll("Delete word backwards", "向後刪除單字");
	s = s.replaceAll("Delete word forwards", "向前刪除單字");
	s = s.replaceAll("Delete to start of line", "刪至行首");
	s = s.replaceAll("Delete to end of line", "刪至行尾");
	s = s.replaceAll("Paste the most-recently-deleted text", "貼上最近刪除的文字");
	s = s.replaceAll("Undo", "復原");
	s = s.replaceAll("Path completion / accept autocomplete", "路徑補全／接受自動完成");
	s = s.replaceAll("Cancel autocomplete / abort streaming", "取消自動完成／中止串流");
	s = s.replaceAll("Clear editor (first) / exit (second)", "第一次清空編輯器／第二次離開");
	s = s.replaceAll("Exit (when editor is empty)", "離開（編輯器為空時）");
	s = s.replaceAll("Suspend to background", "暫停到背景");
	s = s.replaceAll("Cycle thinking level", "循環思考等級");
	s = s.replaceAll("Cycle models", "循環模型");
	s = s.replaceAll("Open model selector", "開啟模型選擇器");
	s = s.replaceAll("Toggle tool output expansion", "切換工具輸出展開");
	s = s.replaceAll("Toggle thinking block visibility", "切換思考區塊顯示");
	s = s.replaceAll("Edit message in external editor", "在外部編輯器編輯訊息");
	s = s.replaceAll("Queue follow-up message", "排入後續訊息");
	s = s.replaceAll("Restore queued messages", "還原佇列訊息");
	s = s.replaceAll("Paste image from clipboard", "從剪貼簿貼上圖片");
	s = s.replaceAll("Slash commands", "斜線命令");
	s = s.replaceAll("Run bash command", "執行 bash 命令");
	s = s.replaceAll("Run bash command (excluded from context)", "執行 bash 命令（不納入上下文）");
	s = s.replaceAll("Toggle Fathom runtime coupling on/off", "切換 Fathom 執行期耦合 開/關");
	s = s.replaceAll("Refresh the active Fathom packet", "刷新目前 Fathom 封包");

	// Session tree / provider / compaction
	s = s.replaceAll("Session Tree", "工作階段樹");
	s = s.replaceAll("Type to search:", "輸入以搜尋：");
	s = s.replaceAll("Select provider to login:", "選擇要登入的供應商：");
	s = s.replaceAll("Branch from Message", "從訊息建立分支");
	s = s.replaceAll("Select a message to create a new branch from that point", "選擇一則訊息，從該點建立新分支");
	s = s.replaceAll("↑/↓: move. ←/→: page. ^←/^→ or Alt+←/Alt+→: fold/branch. shift+l: label. ^D/^T/^U/^L/^A: filters (^O/⇧^O cycle). shift+t: label time", "↑/↓：移動。←/→：換頁。^←/^→ 或 Alt+←/Alt+→：摺疊/分支。shift+l：標籤。^D/^T/^U/^L/^A：篩選（^O/⇧^O 循環）。shift+t：標籤時間");
	s = s.replaceAll("Compacting Context", "正在壓縮上下文");
	s = s.replaceAll("Compacting context... (escape to cancel)", "正在壓縮上下文...（Esc 可取消）");
	s = s.replaceAll("Compacted from", "已從");
	s = s.replaceAll("tokens (", "tokens（");
	s = s.replaceAll(" to expand)", " 可展開）");

	// Scoped models selector footer/hints
	s = s.replaceAll("Enter toggle", "Enter 切換");
	s = s.replaceAll("^A all", "^A 全部");
	s = s.replaceAll("^X clear", "^X 清除");
	s = s.replaceAll("^P provider", "^P 供應商");
	s = s.replaceAll("Alt+↑↓ reorder", "Alt+↑↓ 重排");
	s = s.replaceAll("^S save", "^S 儲存");
	s = s.replaceAll("all enabled", "全部啟用");
	s = s.replaceAll(" enabled", " 已啟用");

	// Regex failsafe for mixed/partially translated lines
	s = s.replace(/Type to search\s*·\s*Enter\/Space to change\s*·\s*Esc to\s*(?:cancel|取消)/i, "輸入以搜尋 · Enter/Space 變更 · Esc 取消");
	s = s.replace(/\bSession-only\. Ctrl\+S to save to settings\./i, "僅限本次。Ctrl+S 儲存設定。");
	s = s.replace(/\bSelect provider to login:\s*$/i, "選擇要登入的供應商：");
	s = s.replace(/\bCompacting context\.\.\.\s*\(escape to cancel\)/i, "正在壓縮上下文...（Esc 可取消）");
	s = s.replace(/\bCompacting context\.\.\.\s*\(([^)]+) to cancel\)/i, (_m, key) => `正在壓縮上下文...（${key} 可取消）`);
	s = s.replace(/\bAuto-compacting\.\.\.\s*\(([^)]+) to cancel\)/i, (_m, key) => `自動壓縮中...（${key} 可取消）`);
	s = s.replace(/\bContext overflow detected,\s*Auto-compacting\.\.\.\s*\(([^)]+) to cancel\)/i, (_m, key) => `偵測到上下文溢位，自動壓縮中...（${key} 可取消）`);
	s = s.replace(/\bCompacting Context\b/i, "正在壓縮上下文");
	s = s.replace(/\bCompacted from\s+([\d,]+)\s+tokens\s*\(([^)]*)\)/i, (_m, n, exp) => `已從 ${n} tokens（${exp}）`);


	return s;
}


function tSelector(i18n: I18nApi, line: string): string {
	if (isZhTw(i18n.getLocale())) return tSelectorLegacyZhTw(i18n, line);
	const pack = getCoreHackPack(i18n.getLocale());
	if (!pack) return isZhCn(i18n.getLocale()) ? postprocessZhCnUiLine(String(line ?? "")) : line;
	const translated = applyExactMap(String(line ?? ""), pack.exact);
	return isZhCn(i18n.getLocale()) ? postprocessZhCnUiLine(translated) : translated;
}

function patchOnce<T extends object>(obj: T, key: string, patcher: () => void): void {
	const mark = `__pi_i18n_patched_${key}__`;
	if ((obj as any)[mark]) return;
	(obj as any)[mark] = true;
	patcher();
}

function patchSessionSelector(selector: any): void {
	const header = selector?.header;
	if (header?.constructor?.prototype?.render) {
		patchOnce(header.constructor.prototype, "session_selector_header_render", () => {
			const orig = header.constructor.prototype.render;
			header.constructor.prototype.render = function patchedRender(width: number) {
				const api = getCurrentI18n();
				const lines = orig.call(this, width);
				return api && Array.isArray(lines) ? lines.map((l: string) => tUiLine(api, l)) : lines;
			};
		});
	}

	const list = selector?.sessionList;
	if (list?.constructor?.prototype?.render) {
		patchOnce(list.constructor.prototype, "session_selector_list_render", () => {
			const orig = list.constructor.prototype.render;
			list.constructor.prototype.render = function patchedRender(width: number) {
				const api = getCurrentI18n();
				const lines = orig.call(this, width);
				return api && Array.isArray(lines) ? lines.map((l: string) => tUiLine(api, l)) : lines;
			};
		});
	}
}

const ZH_TW_BUILTIN_SLASH_DESC_BY_NAME: Record<string, string> = {
	"settings": "開啟設定選單",
	"model": "選擇模型（開啟選擇器）",
	"scoped-models": "啟用/停用模型（用於 Ctrl+P 循環切換）",
	"export": "匯出工作階段（預設 HTML，或指定 .html/.jsonl 路徑）",
	"import": "從 JSONL 檔案匯入並恢復工作階段",
	"share": "以 GitHub secret gist 分享工作階段",
	"copy": "複製上一則助理訊息到剪貼簿",
	"name": "設定工作階段顯示名稱",
	"session": "顯示工作階段資訊與統計",
	"changelog": "顯示更新紀錄",
	"hotkeys": "顯示所有鍵盤快捷鍵",
	"fork": "從先前訊息建立新分岔",
	"clone": "在目前位置複製目前工作階段",
	"tree": "瀏覽工作階段樹（切換分支）",
	"login": "使用 OAuth 供應商登入",
	"logout": "登出 OAuth 供應商",
	"new": "開始新工作階段",
	"compact": "手動壓縮工作階段上下文",
	"resume": "恢復其他工作階段",
	"reload": "重新載入鍵位、擴充、技能、提示與主題",
	"quit": "結束 pi",
};

function localizeBuiltinSlashDesc(i18n: I18nApi, name: string, currentDesc?: string): string | undefined {
	// Prefer bundle-key translation for *all* locales.
	const key = `pi.slash.${name}.description`;
	const translated = i18n.t(key);
	if (translated !== key) return translated;

	// Fallback: legacy hardcoded map (zh-TW only). Kept for older bundles.
	if (isZhTw(i18n.getLocale())) return ZH_TW_BUILTIN_SLASH_DESC_BY_NAME[name] ?? currentDesc;
	return currentDesc;
}

async function patchCoreBuiltinSlashCommandDescriptions(i18n: I18nApi): Promise<{ ok: boolean; reason?: string; changed?: number }> {
	try {
		const mod: any = await importFromPiCodingAgentDist("core/slash-commands.js");
		const list: any[] | undefined = mod?.BUILTIN_SLASH_COMMANDS;
		if (!Array.isArray(list)) return { ok: false, reason: "BUILTIN_SLASH_COMMANDS not found" };

		const state = getState();
		if (!state.original) state.original = {};
		if (!state.original.slashDescs) {
			state.original.slashDescs = {};
			for (const cmd of list) {
				if (cmd && typeof cmd.name === "string") state.original.slashDescs[cmd.name] = cmd.description;
			}
		}

		let changed = 0;
		for (const cmd of list) {
			if (!cmd || typeof cmd.name !== "string") continue;
			const orig = state.original.slashDescs?.[cmd.name];

			const base = orig ?? cmd.description;
			const next = localizeBuiltinSlashDesc(i18n, cmd.name, base);
			// `changed` counts commands we *successfully localized* (translation differs
			// from the English original `base`), not commands whose value physically
			// changed on this call. On an idempotent re-install (same locale, cmd
			// already localized by a prior pass) the value is unchanged yet
			// localization still succeeded — that is primary, not fallback.
			if (typeof next === "string" && next !== base) {
				cmd.description = next;
				changed++;
			}
		}

		return { ok: true, changed };
	} catch (e) {
		return { ok: false, reason: String(e) };
	}
}

function tSlashDesc(i18n: I18nApi, item: any): string | undefined {
	const desc = item?.description as string | undefined;
	if (!desc) return desc;

	// Prefer key-based translation by command name.
	// Command names are stable identifiers; descriptions can change across versions.
	const rawName = typeof item?.name === "string" ? item.name : typeof item?.value === "string" ? (item.value as string) : typeof item?.label === "string" ? (item.label as string) : "";
	const name = rawName.replace(/^\//, "").split(/\s+/)[0] ?? "";
	if (name && !name.includes(" ")) {
		const key = `pi.slash.${name}.description`;
		const translated = i18n.t(key);
		if (translated !== key) {
			return translated;
		}
	}

	// Runtime cache for extension/prompt/skill command descriptions.
	if (name) {
		const runtime = resolveRuntimeCommandDescription(i18n.getLocale(), name, desc, getActiveUiCache());
		if (runtime) return runtime;
	}

	// Fallback: legacy string replacement (zh-TW only). Kept for older bundles.
	let s = String(desc);
	if (isZhTw(i18n.getLocale())) {
		s = s.replaceAll("Open settings menu", "開啟設定選單");
		s = s.replaceAll("Select model (opens selector UI)", "選擇模型（開啟選擇器）");
		s = s.replaceAll("Enable/disable models for Ctrl+P cycling", "啟用/停用模型（用於 Ctrl+P 循環切換）");
		s = s.replaceAll("Export session (HTML default, or specify path: .html/.jsonl)", "匯出工作階段（預設 HTML，或指定 .html/.jsonl 路徑）");
		s = s.replaceAll("Import and resume a session from a JSONL file", "從 JSONL 檔案匯入並恢復工作階段");
		s = s.replaceAll("Share session as a secret GitHub gist", "以 GitHub secret gist 分享工作階段");
		s = s.replaceAll("Copy last agent message to clipboard", "複製上一則助理訊息到剪貼簿");
		s = s.replaceAll("Set session display name", "設定工作階段顯示名稱");
		s = s.replaceAll("Show session info and stats", "顯示工作階段資訊與統計");
		s = s.replaceAll("Show changelog entries", "顯示更新紀錄");
		s = s.replaceAll("Show all keyboard shortcuts", "顯示所有鍵盤快捷鍵");
		s = s.replaceAll("Create a new fork from a previous message", "從先前訊息建立新分岔");
		s = s.replaceAll("Duplicate the current session at the current position", "在目前位置複製目前工作階段");
		s = s.replaceAll("Navigate session tree (switch branches)", "瀏覽工作階段樹（切換分支）");
		s = s.replaceAll("Login with OAuth provider", "使用 OAuth 供應商登入");
		s = s.replaceAll("Logout from OAuth provider", "登出 OAuth 供應商");
		s = s.replaceAll("Start a new session", "開始新工作階段");
		s = s.replaceAll("Manually compact the session context", "手動壓縮工作階段上下文");
		s = s.replaceAll("Resume a different session", "恢復其他工作階段");
		s = s.replaceAll("Reload keybindings, extensions, skills, prompts, and themes", "重新載入鍵位、擴充、技能、提示與主題");
		s = s.replaceAll("Quit pi", "結束 pi");
	}
	return tCore(i18n, s);
}

const NEVER_LOCALIZE_TEXT_TREE_COMPONENTS = new Set([
	// Transcript/message payload components (must remain verbatim)
	"AssistantMessageComponent",
	"UserMessageComponent",
	"ToolExecutionComponent",
	"BashExecutionComponent",
	"CustomMessageComponent",
	"SkillInvocationMessageComponent",
	"BranchSummaryMessageComponent",
	"CompactionSummaryMessageComponent",
]);

function localizeTextTree(node: any, api: I18nApi): void {
	try {
		const ctorName = node?.constructor?.name;
		if (ctorName && NEVER_LOCALIZE_TEXT_TREE_COMPONENTS.has(ctorName)) return;

		if (node?.setText && typeof node?.getText === "function") {
			const cur = node.getText();
			const next = tUiLine(api, cur);
			if (next !== cur) node.setText(next);
		} else if (node?.setText && typeof node?.text === "string") {
			const cur = String(node.text ?? "");
			const next = tUiLine(api, cur);
			if (next !== cur) node.setText(next);
		}
		const children: any[] = node?.children ?? [];
		for (const c of children) localizeTextTree(c, api);
	} catch {
		// ignore
	}
}

function applySubstrMapSorted(input: string, map: Record<string, string>): string {
	let out = String(input ?? "");
	const entries = Object.entries(map ?? {}).filter(([k, v]) => !!k && typeof v === "string" && v.length > 0);
	// Replace longest keys first to avoid partial replacements eating longer phrases.
	entries.sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0));
	for (const [k, v] of entries) {
		try {
			out = out.replaceAll(k, v);
		} catch {
			// ignore
		}
	}
	return out;
}

function localizeHotkeysMarkdown(chatContainer: any, api: I18nApi): void {
	try {
		if (!chatContainer || !api) return;
		const pack = getCoreHackPack(api.getLocale());
		if (!pack) return;
		const children: any[] = chatContainer?.children ?? [];
		if (!Array.isArray(children) || children.length === 0) return;

		for (let i = children.length - 1; i >= 0; i--) {
			const n = children[i];
			const ctor = n?.constructor?.name;
			if (ctor !== "Markdown") continue;
			const cur = typeof n?.text === "string" ? (n.text as string) : "";
			if (!cur) continue;
			// Heuristic anchor: core /hotkeys Markdown contains this phrase.
			if (!cur.includes("Move cursor / browse history")) continue;

			const next = applySubstrMapSorted(cur, pack.exact);
			if (next !== cur && typeof n?.setText === "function") {
				n.setText(next);
			} else if (next !== cur) {
				n.text = next;
				try {
					n.invalidate?.();
				} catch {
					// ignore
				}
			}
			return;
		}
	} catch {
		// ignore
	}
}

function patchModelSelector(selector: any): void {
	// Patch helper methods that generate strings.
	if (selector?.constructor?.prototype?.getScopeText) {
		patchOnce(selector.constructor.prototype, "model_selector_scope_text", () => {
			const orig = selector.constructor.prototype.getScopeText;
			selector.constructor.prototype.getScopeText = function patchedGetScopeText() {
				const api = getCurrentI18n();
				return api ? tUiLine(api, orig.call(this)) : orig.call(this);
			};
		});
	}
	if (selector?.constructor?.prototype?.getScopeHintText) {
		patchOnce(selector.constructor.prototype, "model_selector_scope_hint", () => {
			const orig = selector.constructor.prototype.getScopeHintText;
			selector.constructor.prototype.getScopeHintText = function patchedGetScopeHintText() {
				const api = getCurrentI18n();
				return api ? tUiLine(api, orig.call(this)) : orig.call(this);
			};
		});
	}

	// Update already-created Text nodes if present.
	try {
		if (selector.scopeText?.setText && selector.getScopeText) selector.scopeText.setText(selector.getScopeText());
		if (selector.scopeHintText?.setText && selector.getScopeHintText) selector.scopeHintText.setText(selector.getScopeHintText());
	} catch {
		// ignore
	}

	try {
		const api = getCurrentI18n();
		if (!api) return;
		localizeTextTree(selector, api);
	} catch {
		// ignore
	}
}

function patchSettingsSelector(selector: any): void {
	try {
		const api = getCurrentI18n();
		if (!api) return;

		// Best: data-level patch of settings items (stable ids + labels/descriptions).
		const list = selector?.settingsList;
		if (Array.isArray(list?.items)) {
			for (const item of list.items) {
				if (typeof item?.label === "string") item.label = tUiLine(api, item.label);
				if (typeof item?.description === "string") item.description = tUiLine(api, item.description);
				if (typeof item?.currentValue === "string") item.currentValue = tUiLine(api, item.currentValue);

				if (typeof item?.submenu === "function" && !(item as any).__pi_i18n_submenu_patched__) {
					(item as any).__pi_i18n_submenu_patched__ = true;
					const origSubmenu = item.submenu;
					item.submenu = function patchedSubmenu(currentValue: any, done: any) {
						const sub = origSubmenu.call(this, currentValue, done);
						patchRenderableComponent(sub);
						localizeTextTree(sub, api);
						return sub;
					};
				}
			}
		}

		// Fallback: patch hint-row producer in SettingsList.
		if (list?.constructor?.prototype?.addHintLine) {
			patchOnce(list.constructor.prototype, "settings_list_hint_line", () => {
				const orig = list.constructor.prototype.addHintLine;
				list.constructor.prototype.addHintLine = function patchedAddHintLine(lines: string[], width: number) {
					orig.call(this, lines, width);
					const curApi = getCurrentI18n();
					if (!curApi || !Array.isArray(lines) || lines.length === 0) return;
					const idx = lines.length - 1;
					if (typeof lines[idx] === "string") lines[idx] = tUiLine(curApi, lines[idx]);
				};
			});
		}

		localizeTextTree(selector, api);
	} catch {
		// ignore
	}
}

function patchScopedModelsSelector(selector: any): void {
	try {
		const api = getCurrentI18n();
		if (!api) return;

		if (selector?.constructor?.prototype?.getFooterText) {
			patchOnce(selector.constructor.prototype, "scoped_models_footer_text", () => {
				const orig = selector.constructor.prototype.getFooterText;
				selector.constructor.prototype.getFooterText = function patchedGetFooterText() {
					const curApi = getCurrentI18n();
					const out = orig.call(this);
					return curApi ? tUiLine(curApi, out) : out;
				};
			});
		}

		if (selector?.constructor?.prototype?.updateList) {
			patchOnce(selector.constructor.prototype, "scoped_models_update_list", () => {
				const orig = selector.constructor.prototype.updateList;
				selector.constructor.prototype.updateList = function patchedUpdateList() {
					const out = orig.call(this);
					const curApi = getCurrentI18n();
					if (curApi) localizeTextTree(this, curApi);
					return out;
				};
			});
		}

		localizeTextTree(selector, api);
	} catch {
		// ignore
	}
}

function patchRenderableComponent(component: any): void {
	const proto = component?.constructor?.prototype;
	const ctorName = component?.constructor?.name ?? "component";
	if (!proto?.render) return;
	if (NEVER_LOCALIZE_TEXT_TREE_COMPONENTS.has(ctorName)) return;
	patchOnce(proto, `generic_render_${ctorName}`, () => {
		const orig = proto.render;
		proto.render = function patchedRender(width: number) {
			const lines = orig.call(this, width);
			const api = getCurrentI18n();
			if (!api || !Array.isArray(lines)) return lines;
			return lines.map((l: any) => (typeof l === "string" ? tUiLine(api, l) : l));
		};
	});
}

export async function installCoreHacks(i18n: I18nApi): Promise<{ ok: boolean; reason?: string }> {
	const state = getState();
	setCurrentI18n(i18n);

	// -------------------------------------------------------------------------
	// Slash command description localization
	// Primary: patch core's BUILTIN_SLASH_COMMANDS in-place
	// Fallback: autocomplete output patch (below) still localizes what the user sees
	// -------------------------------------------------------------------------
	try {
		const res = await patchCoreBuiltinSlashCommandDescriptions(i18n);
		// pi-di18n 修复：原 pi-i18n 写死 isZhTw() 守卫，导致 zh-CN 等所有非繁中 locale
		// 直接落入 none 分支，slash 描述本地化从未对这些 locale 生效。
		// 改为：只要是本地化 locale（非 en），就走 primary/fallback 判定。
		if (isLocalizedLocale(i18n.getLocale())) {
			if (res.ok && (res.changed ?? 0) > 0) setSlashDescMode("primary");
			else setSlashDescMode("fallback", res.reason ?? "core patch made no changes");
		} else {
			setSlashDescMode("none");
		}
	} catch (e) {
		setSlashDescMode(isLocalizedLocale(i18n.getLocale()) ? "fallback" : "none", String(e));
	}

	let patchedAny = false;
	const reasons: string[] = [];

	// -------------------------------------------------------------------------
	// Patch InteractiveMode (status/warn/error + selector UIs)
	// -------------------------------------------------------------------------
	try {
		// Interactive mode only. If module path changes, we fail closed.
		const mod: any = await importFromPiCodingAgentDist("modes/interactive/interactive-mode.js");
		const InteractiveMode = mod?.InteractiveMode;
		if (InteractiveMode?.prototype) {
			patchedAny = true;

			patchMethod(InteractiveMode.prototype, "showStatus", (orig) =>
				function patchedShowStatus(this: any, message: string) {
					const api = getCurrentI18n();
					const next = api ? tCore(api, message) : message;
					probeHit("interactive.showStatus", next !== message);
					return orig.call(this, next);
				},
				"interactive.showStatus",
			);
			patchMethod(InteractiveMode.prototype, "showWarning", (orig) =>
				function patchedShowWarning(this: any, message: string) {
					const api = getCurrentI18n();
					const next = api ? tCore(api, message) : message;
					const localizedPrefix = !api ? null : isZhCn(api.getLocale()) || isZhTw(api.getLocale()) ? "警告：" : null;
					probeHit("interactive.showWarning", next !== message || localizedPrefix !== null);
					try {
						const before = Array.isArray(this?.chatContainer?.children) ? this.chatContainer.children.length : 0;
						const ret = orig.call(this, next);
						if (!localizedPrefix || !Array.isArray(this?.chatContainer?.children)) return ret;
						for (let i = this.chatContainer.children.length - 1; i >= before; i--) {
							const child = this.chatContainer.children[i];
							if (typeof child?.setText !== "function" || typeof child?.text !== "string") continue;
							child.setText(String(child.text).replace(/Warning:\s*/g, localizedPrefix).replace(/警告\s+：/g, "警告："));
							break;
						}
						return ret;
					} catch (e) {
						// 同 showError：patch 层不放大原生 showWarning 的瞬态异常成 uncaughtException。
						// 记 probe 的 unsafe 状态，便于 /lang probe 诊断（与 showStatus 失败处理一致）。
						probeHook("interactive.showWarning", "unsafe", String(e));
						try { console.error(next); } catch {}
						return;
					}
				},
				"interactive.showWarning",
			);
			patchMethod(InteractiveMode.prototype, "addCacheMissNotice", (orig) =>
				function patchedAddCacheMissNotice(this: any, miss: any) {
					const api = getCurrentI18n();
					let before = -1;
					try {
						const children = this?.chatContainer?.children;
						if (Array.isArray(children)) before = children.length;
					} catch (e) {
						// Snapshot failure must not prevent the upstream method from running.
						probeHook("interactive.addCacheMissNotice", "unsafe", String(e));
					}
					let ret: any;
					try {
						ret = orig.call(this, miss);
					} catch (e) {
						// Cache miss notice is diagnostic UI only. A core TUI failure must not
						// abort the session or change the cache accounting result.
						probeHook("interactive.addCacheMissNotice", "unsafe", String(e));
						return;
					}
					if (!api || before < 0) return ret;
					try {
						const children = this?.chatContainer?.children;
						if (!Array.isArray(children)) return ret;
						for (let i = children.length - 1; i >= before; i--) {
							const child = children[i];
							if (typeof child?.setText !== "function") continue;
							const current = typeof child.getText === "function" ? child.getText() : child.text;
							if (typeof current !== "string") continue;
							const parsed = parseCacheMissNotice(current);
							if (!parsed) continue;
							const translated = formatCacheMissNotice(api.getLocale(), parsed);
							const leading = current.match(/^(?:\u001b\[[0-?]*[ -/]*[@-~])+/)?.[0] ?? "";
							const trailing = current.match(/(?:\u001b\[[0-?]*[ -/]*[@-~])+$/)?.[0] ?? "";
							child.setText(`${leading}${translated}${trailing}`);
							probeHit("interactive.addCacheMissNotice", translated !== stripAnsi(current));
							break;
						}
					} catch (e) {
						// Keep the upstream English text when a Text component or renderer
						// rejects mutation. Never turn localization into a session failure.
						probeHook("interactive.addCacheMissNotice", "unsafe", String(e));
					}
					return ret;
				},
				"interactive.addCacheMissNotice",
			);
			patchMethod(InteractiveMode.prototype, "showError", (orig) =>
				function patchedShowError(this: any, message: string) {
					const api = getCurrentI18n();
					const next = api ? tCore(api, message) : message;
					const localizedPrefix = !api ? null : isZhCn(api.getLocale()) ? "错误：" : isZhTw(api.getLocale()) ? "錯誤：" : null;
					probeHit("interactive.showError", next !== message || localizedPrefix !== null);
					try {
						const before = Array.isArray(this?.chatContainer?.children) ? this.chatContainer.children.length : 0;
						const ret = orig.call(this, next);
						if (!localizedPrefix || !Array.isArray(this?.chatContainer?.children)) return ret;
						for (let i = this.chatContainer.children.length - 1; i >= before; i--) {
							const child = this.chatContainer.children[i];
							if (typeof child?.setText !== "function" || typeof child?.text !== "string") continue;
							child.setText(String(child.text).replace(/Error:\s*/g, localizedPrefix).replace(/錯誤\s+：/g, "錯誤：").replace(/错误\s+：/g, "错误："));
							break;
						}
						return ret;
					} catch (e) {
						// 防御：原生 showError 依赖 pi 内部状态（Spacer/theme/chatContainer），
						// pi 升级或瞬态异常时 orig.call 可能抛错。patch 层不应放大成 uncaughtException
						// 导致 pi 崩溃退出（见 Spacer is not defined 崩溃）。降级到 stderr 兜底，保住进程。
						// 记 probe 的 unsafe 状态，便于 /lang probe 诊断（与 showStatus 失败处理一致）。
						probeHook("interactive.showError", "unsafe", String(e));
						try { console.error(next); } catch {}
						return;
					}
				},
				"interactive.showError",
			);
			patchMethod(InteractiveMode.prototype, "setExtensionStatus", (orig) =>
				function patchedSetExtensionStatus(this: any, key: string, text?: string) {
					const api = getCurrentI18n();
					const next = api && typeof text === "string" ? tCore(api, text) : text;
					return orig.call(this, key, next);
				},
			);
			patchMethod(InteractiveMode.prototype, "showExtensionNotify", (orig) =>
				function patchedShowExtensionNotify(this: any, message: string, type?: string) {
					const api = getCurrentI18n();
					return api ? orig.call(this, tCore(api, message), type) : orig.call(this, message, type);
				},
			);
			patchMethod(InteractiveMode.prototype, "showExtensionSelector", (orig) =>
				async function patchedShowExtensionSelector(this: any, title: string, options: any[], opts: any) {
					const api = getCurrentI18n();
					if (!api) return orig.call(this, title, options, opts);
					const tTitle = tUiLine(api, title);
					if (!Array.isArray(options) || options.some((o: any) => typeof o !== "string")) {
						return orig.call(this, tTitle, options, opts);
					}

					// Preserve a stable internal identity for every option while still showing
					// localized text in the selector. This avoids brittle reverse-mapping by
					// translated string equality and keeps command logic language-agnostic.
					const wrappedOptions = options.map((original: string) => {
						const translated = tUiLine(api, original);
						return {
							original,
							translated,
							toString() {
								return translated;
							},
							valueOf() {
								return translated;
							},
						};
					});

					const chosen = await orig.call(this, tTitle, wrappedOptions, opts);
					if (chosen && typeof chosen === "object" && typeof (chosen as any).original === "string") {
						return (chosen as any).original;
					}
					if (typeof chosen === "string") {
						const match = wrappedOptions.find((p) => p.translated === chosen);
						return match?.original ?? chosen;
					}
					return chosen;
				},
			);
			patchMethod(InteractiveMode.prototype, "showExtensionConfirm", (orig) =>
				function patchedShowExtensionConfirm(this: any, title: string, message: string, opts: any) {
					const api = getCurrentI18n();
					if (!api) return orig.call(this, title, message, opts);
					return orig.call(this, tUiLine(api, title), tUiLine(api, message), opts);
				},
			);
			patchMethod(InteractiveMode.prototype, "showExtensionInput", (orig) =>
				function patchedShowExtensionInput(this: any, title: string, placeholder: string, opts: any) {
					const api = getCurrentI18n();
					if (!api) return orig.call(this, title, placeholder, opts);
					return orig.call(this, tUiLine(api, title), tUiLine(api, placeholder), opts);
				},
			);
			patchMethod(InteractiveMode.prototype, "handleEvent", (orig) =>
				function patchedHandleEvent(this: any, event: any) {
					const api = getCurrentI18n();
					if (api) {
						const prevDefaultThinking = this.defaultHiddenThinkingLabel;
						this.defaultWorkingMessage = tCore(api, "Working...");
						this.defaultHiddenThinkingLabel = tCore(api, "Thinking...");
						if (this.hiddenThinkingLabel === prevDefaultThinking || this.hiddenThinkingLabel === "Thinking...") {
							this.hiddenThinkingLabel = this.defaultHiddenThinkingLabel;
						}
					}
					const result = orig.call(this, event);
					try {
						const cur = getCurrentI18n();
						if (cur) {
							localizeTextTree(this.statusContainer, cur);
						}
					} catch {
						// ignore
					}
					return result;
				},
			);
			patchMethod(InteractiveMode.prototype, "handleNameCommand", (orig) =>
				function patchedHandleNameCommand(this: any, cmd: string) {
					const result = orig.call(this, cmd);
					try {
						const api = getCurrentI18n();
						if (api) localizeTextTree(this.chatContainer, api);
					} catch {
						// ignore
					}
					return result;
				},
			);
			patchMethod(InteractiveMode.prototype, "handleSessionCommand", (orig) =>
				function patchedHandleSessionCommand(this: any, ...args: any[]) {
					const result = orig.apply(this, args as any);
					try {
						const api = getCurrentI18n();
						if (api) localizeTextTree(this.chatContainer, api);
					} catch {
						// ignore
					}
					return result;
				},
			);
			patchMethod(InteractiveMode.prototype, "handleHotkeysCommand", (orig) =>
				function patchedHandleHotkeysCommand(this: any, ...args: any[]) {
					const result = orig.apply(this, args as any);
					try {
						const api = getCurrentI18n();
						if (api) {
							localizeTextTree(this.chatContainer, api);
							// /hotkeys emits one big Markdown blob; packs are exact-match maps, so we translate
							// the Markdown content via substring replacements (safe: this is a core-owned blob).
							localizeHotkeysMarkdown(this.chatContainer, api);
						}
					} catch {
						// ignore
					}
					return result;
				},
			);


			// Patch selector pipeline so we can patch components after construction.
			patchMethod(InteractiveMode.prototype, "showSelector", (orig) =>
				function patchedShowSelector(this: any, create: any) {
					const wrapped = (done: any) => {
						const res = create(done);
						try {
							const comp = res?.component;
							const name = comp?.constructor?.name;
							if (name === "SessionSelectorComponent") patchSessionSelector(comp);
							else if (name === "ModelSelectorComponent") patchModelSelector(comp);
							else if (name === "SettingsSelectorComponent") patchSettingsSelector(comp);
							else if (name === "ScopedModelsSelectorComponent") patchScopedModelsSelector(comp);
							patchRenderableComponent(comp);
							probeHit("interactive.showSelector", true);
						} catch {
							// ignore
						}
						return res;
					};
					return orig.call(this, wrapped);
				},
				"interactive.showSelector",
			);
		} else {
			probeHook("interactive.showStatus", "notFound", "interactive-mode not available");
			probeHook("interactive.showSelector", "notFound", "interactive-mode not available");
			reasons.push("interactive-mode not available");
		}
	} catch (e) {
		probeHook("interactive.showStatus", "unsafe", String(e));
		probeHook("interactive.showSelector", "unsafe", String(e));
		reasons.push(`interactive-mode patch failed: ${String(e)}`);
	}

	// -------------------------------------------------------------------------
	// Patch Loader updates (covers compaction loader labels and similar runtime messages)
	// -------------------------------------------------------------------------
	try {
		if (Loader?.prototype?.updateDisplay) {
			patchedAny = true;
			patchMethod(Loader.prototype, "updateDisplay", (orig) =>
				function patchedUpdateDisplay(this: any) {
					const api = getCurrentI18n();
					if (!api || typeof this?.message !== "string") return orig.call(this);
					const prev = this.message;
					const next = tUiLine(api, prev);
					this.message = next;
					probeHit("loader.updateDisplay", next !== prev);
					try {
						return orig.call(this);
					} finally {
						this.message = prev;
					}
				},
				"loader.updateDisplay",
			);
		} else {
			probeHook("loader.updateDisplay", "notFound", "Loader not available");
			reasons.push("Loader not available");
		}
	} catch (e) {
		probeHook("loader.updateDisplay", "unsafe", String(e));
		reasons.push(`loader patch failed: ${String(e)}`);
	}

	// -------------------------------------------------------------------------
	// Patch autocomplete provider (slash command list) - independent of InteractiveMode
	// -------------------------------------------------------------------------
	try {
		// Use the pi-tui instance we imported statically (avoids brittle core resolution).
		if (CombinedAutocompleteProvider?.prototype) {
			patchedAny = true;
			patchMethod(CombinedAutocompleteProvider.prototype, "getSuggestions", (orig) =>
				async function patchedGetSuggestions(this: any, lines: string[], cursorLine: number, cursorCol: number, options: any) {
					const res = await orig.call(this, lines, cursorLine, cursorCol, options);
					if (!res || typeof res.prefix !== "string" || !res.prefix.startsWith("/")) return res;
					if (!Array.isArray(res.items)) return res;
					const api = getCurrentI18n();
					if (!api) return res;
					let translated = false;
					const items = res.items.map((it: any) => {
						const next = tSlashDesc(api, it);
						if (next !== it?.description) translated = true;
						return { ...it, description: next };
					});
					probeHit("autocomplete.getSuggestions", translated);
					return {
						...res,
						items,
					};
				},
				"autocomplete.getSuggestions",
			);
		} else {
			probeHook("autocomplete.getSuggestions", "notFound", "CombinedAutocompleteProvider not available");
			reasons.push("CombinedAutocompleteProvider not available");
		}
	} catch (e) {
		probeHook("autocomplete.getSuggestions", "unsafe", String(e));
		reasons.push(`autocomplete patch failed: ${String(e)}`);
	}

	state.installed = patchedAny;
	return patchedAny ? { ok: true } : { ok: false, reason: reasons[0] ?? "no patches applied" };
}

export async function uninstallCoreHacks(): Promise<{ ok: boolean; reason?: string }> {
	const state = getState();
	if (!state.installed && !state.original?.slashDescs) return { ok: true };

	let restoredAny = false;
	const reasons: string[] = [];

	const restore = (proto: any, name: string) => {
		const cur = proto?.[name];
		const orig = (cur as any)?.__pi_i18n_original__;
		if (typeof orig === "function") {
			proto[name] = orig;
			restoredAny = true;
		}
	};

	// Built-in slash command descriptions
	try {
		const originals = state.original?.slashDescs;
		if (originals) {
			const mod: any = await importFromPiCodingAgentDist("core/slash-commands.js");
			const list: any[] | undefined = mod?.BUILTIN_SLASH_COMMANDS;
			if (Array.isArray(list)) {
				for (const cmd of list) {
					if (!cmd || typeof cmd.name !== "string") continue;
					if (Object.prototype.hasOwnProperty.call(originals, cmd.name)) {
						cmd.description = originals[cmd.name];
						restoredAny = true;
					}
				}
			} else {
				reasons.push("BUILTIN_SLASH_COMMANDS not available");
			}
		}
	} catch (e) {
		reasons.push(`slash description restore failed: ${String(e)}`);
	}

	// InteractiveMode patches
	try {
		const mod: any = await importFromPiCodingAgentDist("modes/interactive/interactive-mode.js");
		const InteractiveMode = mod?.InteractiveMode;
		if (InteractiveMode?.prototype) {
			restore(InteractiveMode.prototype, "showStatus");
			restore(InteractiveMode.prototype, "showWarning");
			restore(InteractiveMode.prototype, "showError");
			restore(InteractiveMode.prototype, "addCacheMissNotice");
			restore(InteractiveMode.prototype, "setExtensionStatus");
			restore(InteractiveMode.prototype, "showExtensionNotify");
			restore(InteractiveMode.prototype, "showExtensionSelector");
			restore(InteractiveMode.prototype, "showExtensionConfirm");
			restore(InteractiveMode.prototype, "showExtensionInput");
			restore(InteractiveMode.prototype, "handleEvent");
			restore(InteractiveMode.prototype, "showSelector");
		} else {
			reasons.push("interactive-mode not available");
		}
	} catch (e) {
		reasons.push(`interactive-mode restore failed: ${String(e)}`);
	}

	// Loader patch
	try {
		if (Loader?.prototype) {
			restore(Loader.prototype, "updateDisplay");
		}
	} catch (e) {
		reasons.push(`loader restore failed: ${String(e)}`);
	}

	// Autocomplete provider patch
	try {
		// Use the pi-tui instance we imported statically (avoids brittle core resolution).
		if (CombinedAutocompleteProvider?.prototype) {
			restore(CombinedAutocompleteProvider.prototype, "getSuggestions");
		}
	} catch (e) {
		reasons.push(`autocomplete restore failed: ${String(e)}`);
	}

	state.installed = false;
	state.original = undefined;
	setSlashDescMode("none");

	return restoredAny ? { ok: true } : { ok: false, reason: reasons[0] ?? "no patches restored" };
}
