#!/usr/bin/env node
/**
 * 模式 D 确定性合并：有序清单 → 编号标题、内部链接、源位置映射 → 唯一 PRD.md。
 * 不调用模型，不总结或改写正文，不修改子 PRD。相同输入产生相同字节。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_NAME,
  MAP_NAME,
  atomicWrite,
  decodeDestination,
  headingSlug,
  loadConfig,
  markdownLinks,
  maskCode,
  namespaceReferences,
  posix,
  publicStorageUrl,
  readText,
  replaceSpans,
  sha256,
} from "./_prd-core.mjs";

function prepareSection(section, index, globalAnchors) {
  const original = readText(section.source);
  const sourceText = original
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\n+$/u, "");
  // 引用名作用域从单文件变成整份 PRD，先隔离引用定义，避免两个模块的 [shot] 串图。
  const text = namespaceReferences(sourceText, section.id);
  const sourceLines = sourceText.split("\n");
  const visibleLines = maskCode(text).split("\n");
  const lines = text.split("\n");
  const headings = [];
  const counters = [index + 1];
  const seen = new Map();
  const anchors = new Map();
  let offset = 0;
  let previousLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const visible = /^(#{1,6})\s/u.exec(visibleLines[i]);
    if (visible) {
      const level = visible[1].length;
      const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(lines[i])?.[1];
      if (
        !heading ||
        level > 5 ||
        (headings.length === 0 && level !== 1) ||
        (headings.length > 0 && level === 1) ||
        level > previousLevel + 1
      ) {
        throw new Error(
          section.file + " 的标题需从唯一一级标题开始，逐级展开到最多五级。",
        );
      }
      if (level > 1) {
        counters[level - 1] = (counters[level - 1] ?? 0) + 1;
        counters.length = level;
      }
      const numbered = counters.join(".") + ". " + heading;
      const originalHeading =
        /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(sourceLines[i])?.[1] ?? heading;
      const oldBase = headingSlug(originalHeading);
      const duplicate = seen.get(oldBase) ?? 0;
      seen.set(oldBase, duplicate + 1);
      const oldAnchor = duplicate ? oldBase + "-" + (duplicate + 1) : oldBase;
      const anchorBase = headingSlug(numbered);
      const globalCount = globalAnchors.get(anchorBase) ?? 0;
      globalAnchors.set(anchorBase, globalCount + 1);
      const anchor = globalCount
        ? anchorBase + "-" + (globalCount + 1)
        : anchorBase;
      anchors.set(oldAnchor, anchor);
      headings.push({
        sourceLine: i + 1,
        title: numbered,
        anchor,
        level: level + 1,
        start: offset,
        end: offset + lines[i].length,
        value: "#".repeat(level + 1) + " " + numbered,
      });
      previousLevel = level;
    }
    offset += lines[i].length + 1;
  }
  const firstContent = lines.findIndex((line) => line.trim());
  if (!headings.length || headings[0].sourceLine !== firstContent + 1) {
    throw new Error(section.file + " 必须以普通 Markdown 一级标题开头。");
  }
  const links = markdownLinks(text);
  const images = links.filter((link) => link.image);
  for (const image of images) {
    if (!publicStorageUrl(image.href)) {
      throw new Error(
        section.file +
          " 仍有非 Supabase 公共 Storage 图片地址，先上传再合并：" +
          image.href,
      );
    }
  }
  if (section.requireScreenshot && !images.length) {
    throw new Error(section.file + " 缺少清单要求的关键截图。");
  }
  return {
    ...section,
    original,
    text,
    headings,
    anchors,
    links,
    sourceHash: sha256(original),
  };
}

export function buildPrd(directory) {
  const dir = path.resolve(directory);
  const config = loadConfig(dir);
  const globalAnchors = new Map([
    [headingSlug(config.title.trim()), 1],
    [headingSlug("目录"), 1],
  ]);
  const sections = config.sections.map((section, index) =>
    prepareSection(section, index, globalAnchors),
  );
  const bySource = new Map(
    sections.map((section) => [path.resolve(section.source), section]),
  );
  const output = ["# " + config.title.trim(), "", "## 目录", ""];
  for (const section of sections) {
    output.push(
      "- [" +
        section.headings[0].title +
        "](#" +
        section.headings[0].anchor +
        ")",
    );
  }
  output.push("");
  const mapped = [];
  for (const section of sections) {
    const changes = section.headings.map(({ start, end, value }) => ({
      start,
      end,
      value,
    }));
    for (const link of section.links.filter((item) => !item.image)) {
      if (/^[a-z][a-z0-9+.-]*:/iu.test(link.href) || link.href.startsWith("/"))
        continue;
      const decoded = decodeDestination(link.href);
      const hashAt = decoded.indexOf("#");
      const filePart = hashAt < 0 ? decoded : decoded.slice(0, hashAt);
      const fragment = hashAt < 0 ? "" : decoded.slice(hashAt + 1);
      const target = filePart
        ? path.resolve(path.dirname(section.source), filePart)
        : section.source;
      const targetSection = bySource.get(target);
      let value;
      if (targetSection) {
        const anchor = fragment
          ? targetSection.anchors.get(fragment)
          : targetSection.headings[0].anchor;
        if (!anchor)
          throw new Error(
            section.file + " 引用了不存在的子文档标题：" + link.href,
          );
        value = "#" + anchor;
      } else if (filePart) {
        // 源文件可以放在子目录，合并后引用源码/其他文档时基准必须切到 PRD.md 所在目录。
        value =
          encodeURI(posix(path.relative(dir, target))) +
          (fragment ? "#" + encodeURIComponent(fragment) : "");
      }
      if (value && value !== link.href)
        changes.push({ start: link.start, end: link.end, value });
    }
    const body = replaceSpans(section.text, changes);
    const startLine = output.length + 1;
    output.push(...body.split("\n"));
    mapped.push({
      id: section.id,
      file: posix(path.relative(dir, section.source)),
      sourceSha256: section.sourceHash,
      mergedStartLine: startLine,
      mergedEndLine: output.length,
      headings: section.headings.map(({ title, anchor, sourceLine }) => ({
        title,
        anchor,
        sourceLine,
        mergedLine: startLine + sourceLine - 1,
      })),
    });
    output.push("");
  }
  const text = output.join("\n");
  const map = {
    schemaVersion: 1,
    configSha256: config.configHash,
    output: "PRD.md",
    outputSha256: sha256(text),
    sections: mapped,
  };
  return {
    dir,
    text,
    map,
    mapText: JSON.stringify(map, null, 2) + "\n",
    sections,
    config,
  };
}

export function mergePrd(directory, { check = false } = {}) {
  const result = buildPrd(directory);
  const out = path.join(result.dir, "PRD.md");
  const mapFile = path.join(result.dir, MAP_NAME);
  if (check) {
    if (
      !fs.existsSync(out) ||
      readText(out) !== result.text ||
      !fs.existsSync(mapFile) ||
      readText(mapFile) !== result.mapText
    ) {
      throw new Error(
        "PRD.md 或源映射不是当前子文档的合并结果；先重新运行合并，再做全局 review。",
      );
    }
    return result;
  }
  if (
    sha256(readText(path.join(result.dir, CONFIG_NAME))) !==
      result.config.configHash ||
    result.sections.some(
      (section) => sha256(readText(section.source)) !== section.sourceHash,
    )
  ) {
    throw new Error("合并期间源文件发生变化，本次未写入。请重试。");
  }
  atomicWrite(out, result.text);
  atomicWrite(mapFile, result.mapText);
  return result;
}

export function runMergeCli(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "用法：node merge-prototype-prd.mjs <需求目录> [--check] [--locate 最终PRD行号]",
    );
    return;
  }
  let dir;
  let check = false;
  let line;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") check = true;
    else if (argv[i] === "--locate") {
      line = Number(argv[++i]);
      if (!Number.isInteger(line) || line < 1)
        throw new Error("--locate 需要正整数行号。");
    } else if (!argv[i].startsWith("-") && !dir) dir = argv[i];
    else throw new Error("未知或多余参数：" + argv[i]);
  }
  if (!dir) throw new Error("请指定含 prd.config.json 的需求目录。");
  const result = mergePrd(dir, { check: check || line !== undefined });
  if (line !== undefined) {
    const source = result.map.sections.find(
      (item) => line >= item.mergedStartLine && line <= item.mergedEndLine,
    );
    if (!source) throw new Error("该行属于合并器生成的标题、目录或分隔空行。");
    console.log(source.file + ":" + (line - source.mergedStartLine + 1));
  } else {
    console.log(
      (check ? "已验证当前合并结果：" : "已合并：") +
        path.join(result.dir, "PRD.md"),
    );
    console.log(
      "模块/章节 " +
        result.map.sections.length +
        " · SHA-256 " +
        result.map.outputSha256,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runMergeCli();
  } catch (error) {
    console.error("✕ " + error.message);
    process.exitCode = 1;
  }
}
