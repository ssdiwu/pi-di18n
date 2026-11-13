#!/usr/bin/env node
// 核对六语言 pack 与 zh-CN 的键对齐；--check 模式供 CI/回归使用（缺失时非零退出）。
// 用法：node scripts/verify-core-hacks-locales.mjs [--check]
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "core-hacks-locales");
const checkOnly = process.argv.includes("--check");

const files = readdirSync(packDir).filter((f) => f.endsWith(".json"));
const packs = new Map();
for (const f of files) {
	const pack = JSON.parse(readFileSync(join(packDir, f), "utf8"));
	packs.set(pack.locale, pack.exact);
}

const en = packs.get("en") ?? {};
if (Object.keys(en).length !== 0) {
	console.error(`en.json exact must stay empty (English source displays as-is), got ${Object.keys(en).length} entries`);
	process.exit(1);
}

const zhCN = packs.get("zh-CN");
if (!zhCN) {
	console.error("zh-CN.json missing");
	process.exit(1);
}
const zhKeys = new Set(Object.keys(zhCN));

let failures = 0;
for (const [locale, exact] of packs) {
	if (locale === "en" || locale === "zh-CN") continue;
	const missing = [...zhKeys].filter((k) => !(k in exact));
	const extra = Object.keys(exact).filter((k) => !zhKeys.has(k));
	const empty = Object.keys(exact).filter((k) => typeof exact[k] !== "string" || exact[k] === "");
	const self = Object.keys(exact).filter((k) => exact[k] === k && !zhCN[k]?.startsWith(k) && !/^(sse|websocket|gist)$/i.test(k));
	// 提示行等「键含尾随空格」的条目允许值与键不同的部分已由 exact 覆盖；此处只报告纯原样值。
	const status = missing.length === 0 && empty.length === 0 ? "OK" : "FAIL";
	console.log(
		`${locale}: ${Object.keys(exact).length} entries, missing-vs-zh-CN=${missing.length}, legacy-extra=${extra.length}, empty=${empty.length}, self-translated=${self.length} -> ${status}`,
	);
	if (missing.length) {
		failures++;
		if (!checkOnly) console.log("  missing sample:", JSON.stringify(missing.slice(0, 5)));
	}
	if (empty.length) {
		failures++;
		if (!checkOnly) console.log("  empty sample:", JSON.stringify(empty.slice(0, 5)));
	}
}

if (checkOnly && failures > 0) process.exit(1);
