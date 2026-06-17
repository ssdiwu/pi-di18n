// 思考语言本地化（B 线）的类型定义。
//
// 详见 doc/30-路线图/路线图.md 切片 1、doc/10-架构与运行/adr/0001~0003。

/** 翻译条目类型：工具描述 或 参数描述。skill 走运行时兜底，不在预制 baseline。 */
export type ThinkType = "tool" | "param";

/**
 * 单条翻译缓存条目。
 *
 * 存英文原文（en）用于失效比对（ADR 决策 11）：pi 升级后工具 description 改变，
 * 缓存里的 en 与当前 en 不一致即视为过期，触发重翻。
 */
export interface ThinkEntry {
	en: string;
	translated: string;
}

/** 单个 locale 下的翻译数据。 */
export interface ThinkLocaleData {
	tool: Record<string, ThinkEntry>;
	param: Record<string, ThinkEntry>;
}

/**
 * 完整缓存结构，落盘到 ~/.pi/agent/state/pi-di18n/think.json。
 *
 * - enabled：/lang think 开关状态（默认 false，ADR 0002）。
 * - locales：按 locale 组织的翻译缓存。只缓存用过的 locale，避免无限增长。
 */
export interface ThinkCache {
	enabled: boolean;
	locales: Record<string, ThinkLocaleData>;
}

/** describe.ts 收集到的待翻译条目（英文字面量）。 */
export interface DescribeItem {
	type: ThinkType;
	/** tool: 工具名（如 "read"）；param: "工具名:参数名"（如 "edit:edits"）。 */
	key: string;
	en: string;
}
