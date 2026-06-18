import type { BashToolDetails, EditToolDetails, ExtensionAPI, ReadToolDetails } from "@earendil-works/pi-coding-agent";
import { createBashTool, createEditTool, createReadTool, createWriteTool, keyHint } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { I18nApi } from "./types";

function shorten(s: string, max = 90): string {
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

function localeNativeLabel(locale: string): string {
	const raw = String(locale ?? "en").trim().replace(/_/g, "-");
	const l = raw.toLowerCase();
	const base = l.split(/[-_]/)[0] || "en";

	if (l === "zh-tw" || l.startsWith("zh-tw") || l.startsWith("zh-hant")) return "繁體";
	if (l === "zh-cn" || l.startsWith("zh-cn") || l.startsWith("zh-hans")) return "简体";
	if (base === "zh") return "中文";

	if (base === "ja") return "日本語";
	if (base === "ko") return "한국어";
	if (base === "es") return "Español";
	if (base === "it") return "Italiano";
	if (base === "nl") return "Nederlands";
	if (base === "pl") return "Polski";
	if (base === "tr") return "Türkçe";
	if (base === "vi") return "Tiếng Việt";
	if (base === "id") return "Bahasa Indonesia";
	if (base === "uk") return "Українська";
	if (base === "hi") return "हिन्दी";
	if (base === "sv") return "Svenska";
	if (base === "da") return "Dansk";
	if (base === "fi") return "Suomi";
	if (base === "cs") return "Čeština";
	if (base === "ro") return "Română";
	if (base === "el") return "Ελληνικά";
	if (base === "sg" || l === "en-sg") return "English (Singapore)";
	if (l === "pt-br") return "Português (Brasil)";
	if (l === "pt-pt") return "Português (Portugal)";
	if (base === "pt") return "Português";
	if (base === "fr") return "Français";
	if (base === "de") return "Deutsch";
	if (base === "en") return "English";

	// fallback to locale tag
	return raw || "en";
}

function safePath(path: any): string {
	return typeof path === "string" && path.trim() ? path : "?";
}

let _toolsInstalled = false;

export function applyLocalizedHeader(
	pi: ExtensionAPI,
	ctx: any,
	i18n: I18nApi,
	opts?: {
		// When true, render the locale badge/hint line as dim yellow.
		warnCoreMismatch?: boolean;
	},
): void {
	if (!ctx?.hasUI) return;

	ctx.ui.setHeader((_tui: any, theme: any) => {
		const title = theme.fg("accent", theme.bold(i18n.t("pi.ui.header.title")));
		const hint = i18n.t("pi.ui.header.hint", { locale: i18n.getLocale() });

		const rtlWarn = (i18n as any).isRtlSelected?.()
			? theme.fg("warning", i18n.t("pi.language.rtlWarning", { locale: i18n.getLocale() }))
			: "";

		const keys = [
			keyHint("app.model.select", i18n.t("pi.ui.key.model")),
			keyHint("app.thinking.cycle", i18n.t("pi.ui.key.thinking")),
			keyHint("app.tools.expand", i18n.t("pi.ui.key.tools")),
			keyHint("app.message.followUp", i18n.t("pi.ui.key.followUp")),
		].join(theme.fg("dim", "  "));

		return {
			invalidate() {},
			render(width: number): string[] {
				const line1 = truncateToWidth(title, width, "");

				const hintStyled = (() => {
					if (!opts?.warnCoreMismatch) return theme.fg("muted", hint);
					// pi-tui themes don't expose a dedicated "dim" helper; use ANSI dim on/off.
					const DIM_ON = "\x1b[2m";
					const DIM_OFF = "\x1b[22m";
					return theme.fg("warning", `${DIM_ON}${hint}${DIM_OFF}`);
				})();

				const line2 = truncateToWidth(hintStyled + (rtlWarn ? theme.fg("dim", "  ") + rtlWarn : ""), width, "");
				const line3 = truncateToWidth(theme.fg("dim", keys), width, "");
				return [line1, line2, line3, ""]; // blank line spacing
			},
		};
	});
}

export function installLocalizedToolsOnce(pi: ExtensionAPI, i18n: I18nApi): void {
	if (_toolsInstalled) return;
	_toolsInstalled = true;

	// Use a stable base cwd for schema/metadata. Actual execution uses the per-call ctx.cwd.
	const baseCwd = process.cwd();

	const register = () => {
		// --- read ---
		const baseRead = createReadTool(baseCwd);
		pi.registerTool({
			name: "read",
			label: i18n.t("pi.tool.read.label"),
			description: baseRead.description,
			parameters: baseRead.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const tool = createReadTool(ctx.cwd);
				return tool.execute(toolCallId, params as any, signal, onUpdate);
			},
			renderCall(args: any, theme, _context) {
				const text =
					theme.fg("toolTitle", theme.bold(i18n.t("pi.tool.read.call", { path: safePath(args.path) }))) +
					((args.offset || args.limit)
						? theme.fg(
							"dim",
							` (${[
								args.offset ? `offset=${args.offset}` : null,
								args.limit ? `limit=${args.limit}` : null,
							]
								.filter(Boolean)
								.join(", ")})`,
						)
						: "");
				return new Text(text, 0, 0);
			},
			renderResult(result, { expanded, isPartial }, theme, _context) {
				if (isPartial) return new Text(theme.fg("warning", i18n.t("pi.tool.common.running")), 0, 0);
				const details = result.details as ReadToolDetails | undefined;
				const content = result.content[0];
				if (content?.type === "image") return new Text(theme.fg("success", i18n.t("pi.tool.common.done")), 0, 0);
				if (content?.type !== "text") return new Text(theme.fg("error", i18n.t("pi.tool.common.error")), 0, 0);
				const lineCount = content.text.split("\n").length;
				let text = theme.fg("success", i18n.t("pi.tool.read.lines", { count: lineCount }));
				if (details?.truncation?.truncated) {
					text += theme.fg("warning", ` (${i18n.t("pi.tool.common.truncated")})`);
				}
				if (expanded) {
					const lines = content.text.split("\n").slice(0, 18);
					for (const line of lines) text += `\n${theme.fg("dim", line)}`;
					if (lineCount > 18) text += `\n${theme.fg("muted", `${lineCount - 18} more…`)}`;
				} else {
					text += theme.fg("dim", `  ${keyHint("app.tools.expand", i18n.t("pi.ui.key.expand"))}`);
				}
				return new Text(text, 0, 0);
			},
		});

		// --- bash ---
		const baseBash = createBashTool(baseCwd);
		pi.registerTool({
			name: "bash",
			label: i18n.t("pi.tool.bash.label"),
			description: baseBash.description,
			parameters: baseBash.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const tool = createBashTool(ctx.cwd);
				return tool.execute(toolCallId, params as any, signal, onUpdate);
			},
			renderCall(args: any, theme, _context) {
				const cmd = shorten(String(args.command ?? ""), 120);
				return new Text(theme.fg("toolTitle", theme.bold(i18n.t("pi.tool.bash.call", { command: cmd }))), 0, 0);
			},
			renderResult(result, { expanded, isPartial }, theme, _context) {
				if (isPartial) return new Text(theme.fg("warning", i18n.t("pi.tool.common.running")), 0, 0);
				const details = result.details as BashToolDetails | undefined;
				const content = result.content[0];
				const output = content?.type === "text" ? content.text : "";
				const exitMatch = output.match(/exit code: (\d+)/);
				const exitCode = exitMatch ? parseInt(exitMatch[1] ?? "", 10) : null;
				let text =
					exitCode && exitCode !== 0
						? theme.fg("error", i18n.t("pi.tool.bash.exit", { code: exitCode }))
						: theme.fg("success", i18n.t("pi.tool.common.done"));
				if (details?.truncation?.truncated) text += theme.fg("warning", ` (${i18n.t("pi.tool.common.truncated")})`);
				if (expanded && output) {
					const lines = output.split("\n").slice(0, 25);
					for (const line of lines) text += `\n${theme.fg("dim", line)}`;
				}
				return new Text(text, 0, 0);
			},
		});

		// --- edit ---
		const baseEdit = createEditTool(baseCwd);
		pi.registerTool({
			name: "edit",
			label: i18n.t("pi.tool.edit.label"),
			description: baseEdit.description,
			parameters: baseEdit.parameters,
			renderShell: "self",
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const tool = createEditTool(ctx.cwd);
				return tool.execute(toolCallId, params as any, signal, onUpdate);
			},
			renderCall(args: any, theme, _context) {
				return new Text(theme.fg("toolTitle", theme.bold(i18n.t("pi.tool.edit.call", { path: safePath(args.path) }))), 0, 0);
			},
			renderResult(result, { expanded, isPartial }, theme, _context) {
				if (isPartial) return new Text(theme.fg("warning", i18n.t("pi.tool.common.running")), 0, 0);
				const details = result.details as EditToolDetails | undefined;
				const content = result.content[0];
				if (content?.type === "text" && content.text.startsWith("Error")) {
					return new Text(theme.fg("error", content.text.split("\n")[0] ?? i18n.t("pi.tool.common.error")), 0, 0);
				}
				if (!details?.diff) return new Text(theme.fg("success", i18n.t("pi.tool.common.done")), 0, 0);
				const diffLines = details.diff.split("\n");
				let additions = 0;
				let removals = 0;
				for (const line of diffLines) {
					if (line.startsWith("+") && !line.startsWith("+++")) additions++;
					if (line.startsWith("-") && !line.startsWith("---")) removals++;
				}
				let text = theme.fg("success", i18n.t("pi.tool.edit.stats", { add: additions, del: removals }));
				if (expanded) {
					for (const line of diffLines.slice(0, 40)) {
						if (line.startsWith("+") && !line.startsWith("+++")) text += `\n${theme.fg("success", line)}`;
						else if (line.startsWith("-") && !line.startsWith("---")) text += `\n${theme.fg("error", line)}`;
						else text += `\n${theme.fg("dim", line)}`;
					}
				}
				return new Text(text, 0, 0);
			},
		});

		// --- write ---
		const baseWrite = createWriteTool(baseCwd);
		pi.registerTool({
			name: "write",
			label: i18n.t("pi.tool.write.label"),
			description: baseWrite.description,
			parameters: baseWrite.parameters,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const tool = createWriteTool(ctx.cwd);
				return tool.execute(toolCallId, params as any, signal, onUpdate);
			},
			renderCall(args: any, theme, _context) {
				const lines = typeof args.content === "string" ? args.content.split("\n").length : 0;
				const text =
					theme.fg("toolTitle", theme.bold(i18n.t("pi.tool.write.call", { path: safePath(args.path) }))) +
					theme.fg("dim", lines ? ` (${lines} lines)` : "");
				return new Text(text, 0, 0);
			},
			renderResult(result, { isPartial }, theme, _context) {
				if (isPartial) return new Text(theme.fg("warning", i18n.t("pi.tool.common.running")), 0, 0);
				const content = result.content[0];
				if (content?.type === "text" && content.text.startsWith("Error"))
					return new Text(theme.fg("error", content.text.split("\n")[0] ?? i18n.t("pi.tool.common.error")), 0, 0);
				return new Text(theme.fg("success", i18n.t("pi.tool.write.written")), 0, 0);
			},
		});
	};

	// Initial registration (default locale), then update labels when locale changes.
	register();
	pi.events.on("pi-i18n/localeChanged", () => {
		try {
			register();
		} catch {
			// ignore
		}
	});
}

export function notifyLanguageThinkStatus(ctx: any, i18n: I18nApi, thinkEnabled: boolean): void {
	if (!ctx?.hasUI) return;
	ctx.ui?.notify?.(
		i18n.t(thinkEnabled ? "pi.ui.footer.startup.thinkOn" : "pi.ui.footer.startup.thinkOff", {
			locale: localeNativeLabel(i18n.getLocale()),
		}),
		"info",
	);
}

export function applyLocalizedFooter(_pi: ExtensionAPI, ctx: any, i18n: I18nApi, opts?: { force?: boolean; thinkEnabled?: boolean }): void {
	if (!ctx?.hasUI) return;

	// Do not override pi's native footer/status bar. It contains model, cwd, token, git,
	// and worktree status; replacing it with "lang:*" hides important user context.
	notifyLanguageThinkStatus(ctx, i18n, Boolean(opts?.thinkEnabled));
}
