// 收集当前 session 的 tool/param 英文 description（待翻译字面量）。
//
// skill description 是正交扩展（动态、无预制 baseline），走运行时兜底，
// 留待后续切片；本模块切片 1 聚焦 tool/param 的可验证闭环。

import type { DescribeItem } from "./types.js";

/**
 * 从 JSON schema 的 properties 提取参数描述。
 * 兼容 parameters.properties 和 input_schema.properties 两种命名（参考 pi-tool-i18n）。
 * 嵌套 object 的子参数也提取（key 形如 "parent.child"）。
 */
export function extractParamDescriptions(params: unknown, toolName: string): DescribeItem[] {
	const out: DescribeItem[] = [];
	if (!params || typeof params !== "object") return out;
	const root = params as Record<string, unknown>;
	const props = (root.properties ?? (root as any).input_schema?.properties) as Record<string, any> | undefined;
	if (!props) return out;
	for (const [pName, pSchema] of Object.entries(props)) {
		if (!pSchema || typeof pSchema !== "object") continue;
		if (typeof pSchema.description === "string" && pSchema.description) {
			out.push({ type: "param", key: `${toolName}:${pName}`, en: pSchema.description });
		}
		// 嵌套 object 参数（如 edit 的 edits[] 或 object 类型参数的子字段）
		if (pSchema.properties && pSchema.type === "object") {
			for (const [subName, subSchema] of Object.entries(pSchema.properties)) {
				const ss = subSchema as any;
				if (ss && typeof ss.description === "string" && ss.description) {
					out.push({ type: "param", key: `${toolName}:${pName}.${subName}`, en: ss.description });
				}
			}
		}
	}
	return out;
}

/**
 * 从 ToolInfo[] 收集所有 tool/param 的英文 description。
 * ToolInfo 来自 pi.getAllTools()，含 name / description / parameters。
 */
export function collectDescriptions(tools: Array<{ name: string; description?: string; parameters?: unknown }>): DescribeItem[] {
	const out: DescribeItem[] = [];
	for (const t of tools) {
		if (!t?.name) continue;
		if (typeof t.description === "string" && t.description) {
			out.push({ type: "tool", key: t.name, en: t.description });
		}
		out.push(...extractParamDescriptions(t.parameters, t.name));
	}
	return out;
}
