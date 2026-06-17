// 导出 pi 自带工具的英文 description baseline（tool + param）。
//
// 用途：生成 think-localization 的预制 baseline 数据源。
// pi 升级新增/修改工具 description 后重跑此脚本刷新 baseline。
//
// 用法：node scripts/export-think-baseline.mjs > <output.json>
//
// 输出结构（与 src/think-locales/*.json 的 en.json 同构）：
//   { version: 1, locale: "en", tool: { read: "...", bash: "..." },
//     param: { "read:path": "...", "edit:edits": "..." } }

// 包顶层未导出 createToolDefinition（exports 字段限制），用绝对路径直接 import dist 子模块。
// 该路径与 src/core-hacks.ts 的 coreDist 发现逻辑一致（见 getCoreDistDebug）。
import { createToolDefinition } from "file:///opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.js";

const TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"];

function extractParams(params) {
	const out = {};
	if (!params) return out;
	const props = params.properties ?? params.input_schema?.properties ?? {};
	for (const [name, schema] of Object.entries(props)) {
		if (schema?.description) out[name] = schema.description;
		// 嵌套 object 的子参数（pi-tool-i18n 也提取这层）
		if (schema?.properties && schema?.type === "object") {
			for (const [subName, subSchema] of Object.entries(schema.properties)) {
				if (subSchema?.description) out[`${name}.${subName}`] = subSchema.description;
			}
		}
	}
	return out;
}

const tool = {};
const param = {};

for (const name of TOOL_NAMES) {
	try {
		const def = createToolDefinition(name, process.cwd());
		tool[name] = def.description ?? "";
		const params = extractParams(def.parameters);
		for (const [pName, pDesc] of Object.entries(params)) {
			param[`${name}:${pName}`] = pDesc;
		}
	} catch (err) {
		process.stderr.write(`[WARN] failed to export tool "${name}": ${err?.message ?? err}\n`);
	}
}

const output = { version: 1, locale: "en", tool, param };
process.stdout.write(JSON.stringify(output, null, 2) + "\n");

const toolCount = Object.keys(tool).length;
const paramCount = Object.keys(param).length;
process.stderr.write(`[OK] exported ${toolCount} tools, ${paramCount} params\n`);
