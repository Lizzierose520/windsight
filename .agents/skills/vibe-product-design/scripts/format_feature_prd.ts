#!/usr/bin/env -S npx --yes tsx
/**
 * 用 prettier 就地规范化模式 B 的 PRD 或模式 D 的源文件。
 * 对应原 format_feature_prd.py。
 *
 * 模式 D 的最终 PRD.md 由确定性合并器生成；格式修改必须落回源文件再合并，
 * 否则来源校验会发现成稿与子文档不一致。复用 _md.ts 的 formatMarkdown。
 *
 * 用法：
 *   tsx format_feature_prd.ts <PRD.md 路径>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { formatMarkdown } from "./_md.ts";
import { ensureVibeGitignoreFrom } from "./_context.ts";

function expandHome(p: string): string {
  if (p === "~") return process.env.HOME ?? p;
  if (p.startsWith("~/")) return path.join(process.env.HOME ?? "", p.slice(2));
  return p;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length !== 1) {
    process.stderr.write("用法：format_feature_prd.ts <PRD.md 路径>\n");
    process.exit(1);
  }
  const p = path.resolve(expandHome(argv[0]));
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    process.stderr.write(`文件不存在：${p}\n`);
    process.exit(1);
  }

  // 若该 PRD 位于 .context/vibe-product-design 产出树内，确保根下有 .gitignore（缺失才写）。
  ensureVibeGitignoreFrom(p);

  const original = fs.readFileSync(p, "utf-8");
  const { text, ok } = formatMarkdown(original);

  if (!ok) {
    process.stdout.write(
      "⚠️ 未能调用 prettier，已跳过规范化。需本机有 Node/npx（会用 npx prettier）。\n",
    );
    return;
  }
  if (text !== original) {
    fs.writeFileSync(p, text, "utf-8");
    process.stdout.write(`🧹 已用 prettier 规范化：${p}\n`);
  } else {
    process.stdout.write("ℹ️ 格式已规范，无需改动。\n");
  }
}

main();
