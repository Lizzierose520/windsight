/**
 * 模式 D 共用的文件边界、清单与 Markdown 定位。
 * 这里只解析流程需要改写的标题和链接；正文、表格和代码不交给模型重新生成。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// 截图与 PRD 共用产出根，避免配置、忽略规则和本地引用分散到拼写不同的目录。
export const SCREENSHOTS_ROOT = ".context/vibe-product-design/screenshots";
export const CONFIG_NAME = "prd.config.json";
export const MAP_NAME = "_prd-source-map.json";
export const ASSET_MANIFEST = "_prd-assets.json";
export const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const posix = (value) => value.split(path.sep).join("/");
export const readText = (file) => fs.readFileSync(file, "utf8");
export const isWithin = (root, file) => {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
};

export function scopedFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) {
    throw new Error("清单必须使用需求目录内的相对文件路径。");
  }
  const file = path.resolve(root, relative);
  if (
    !isWithin(root, file) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile() ||
    !isWithin(fs.realpathSync(root), fs.realpathSync(file))
  ) {
    throw new Error("源文件不存在、不是文件或越出需求目录：" + relative);
  }
  return file;
}

export function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) return [];
      const file = path.join(dir, entry.name);
      return entry.isDirectory()
        ? walkFiles(file)
        : entry.isFile()
          ? [file]
          : [];
    });
}

export function loadConfig(dir) {
  const file = path.join(dir, CONFIG_NAME);
  const raw = readText(file);
  const config = JSON.parse(raw);
  if (
    config.schemaVersion !== 1 ||
    typeof config.title !== "string" ||
    !config.title.trim() ||
    /[\r\n]/u.test(config.title) ||
    !Array.isArray(config.sections) ||
    !config.sections.length
  ) {
    throw new Error(
      "prd.config.json 需要 schemaVersion: 1、单行 title 和有序 sections。",
    );
  }
  const ids = new Set();
  const files = new Set();
  const sections = config.sections.map((item) => {
    if (
      !item ||
      !/^[a-z][a-z0-9-]*$/u.test(item.id ?? "") ||
      ids.has(item.id)
    ) {
      throw new Error("模块 id 必须是唯一的英文小写标识。");
    }
    const source = scopedFile(dir, item.file);
    const name = path.basename(source);
    if (
      !name.endsWith(".md") ||
      name === "PRD.md" ||
      files.has(fs.realpathSync(source))
    ) {
      throw new Error("重复源文件或把最终 PRD.md 当成了输入：" + item.file);
    }
    if (
      item.requireScreenshot !== undefined &&
      typeof item.requireScreenshot !== "boolean"
    ) {
      throw new Error("requireScreenshot 必须是布尔值：" + item.file);
    }
    ids.add(item.id);
    files.add(fs.realpathSync(source));
    return { ...item, source };
  });
  // 遗漏已写好的编号子文档应直接失败，不能悄悄交付一份少了模块的“完整”PRD。
  for (const candidate of walkFiles(dir)) {
    if (
      /^\d{2,3}-.+\.md$/u.test(path.basename(candidate)) &&
      !files.has(fs.realpathSync(candidate))
    ) {
      throw new Error(
        "编号子文档未列入 sections：" + posix(path.relative(dir, candidate)),
      );
    }
  }
  return { ...config, sections, configHash: sha256(raw) };
}

export function atomicWrite(file, text) {
  const temporary = file + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(temporary, text);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// 保留字符偏移与换行，把代码遮掉，防止把示例中的图片、标题或链接当作真正正文改写。
export function maskCode(text) {
  const chars = text.split("");
  const hide = (start, end) => {
    for (let i = start; i < end; i++)
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  };
  let fence = null;
  const lists = [];
  let offset = 0;
  for (const line of text.split(/(?<=\n)/u)) {
    const logical = line
      .replace(/^(?: {0,3}>\s?)+/u, "")
      .replace(/\t/gu, "    ");
    const match = /^\s*(?:(?:[-+*]|\d+[.)])\s+)?(\x60{3,}|~{3,})(.*)$/u.exec(
      logical.trimEnd(),
    );
    const indentation = /^ */u.exec(logical)[0].length;
    const marker = /^( *)(?:[-+*]|\d+[.)]) +/u.exec(logical);
    if (!fence && marker) {
      while (lists.length && lists.at(-1).indent >= marker[1].length)
        lists.pop();
      lists.push({ indent: marker[1].length, content: marker[0].length });
    } else if (!fence && logical.trim()) {
      while (lists.length && indentation < lists.at(-1).content) lists.pop();
    }
    if (fence) {
      hide(offset, offset + line.length);
      if (
        match &&
        match[1][0] === fence.char &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = null;
    } else if (match) {
      fence = { char: match[1][0], length: match[1].length };
      hide(offset, offset + line.length);
    } else if (
      logical.trim() &&
      indentation >= (lists.at(-1)?.content ?? 0) + 4
    ) {
      hide(offset, offset + line.length);
    }
    offset += line.length;
  }
  if (fence) throw new Error("Markdown 围栏代码块未闭合。");
  const visible = chars.join("");
  const backtick = String.fromCharCode(96);
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] !== backtick) continue;
    let end = i;
    while (visible[end] === backtick) end++;
    const run = visible.slice(i, end);
    let close = visible.indexOf(run, end);
    while (
      close >= 0 &&
      (visible[close - 1] === backtick ||
        visible[close + run.length] === backtick)
    ) {
      close = visible.indexOf(run, close + run.length);
    }
    if (close >= 0) {
      hide(i, close + run.length);
      i = close + run.length - 1;
    }
  }
  return chars.join("");
}

function closing(text, start, open, close) {
  let depth = 1;
  let quote = null;
  let angle = false;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (open === "(") {
      if (angle) {
        if (text[i] === ">") angle = false;
        continue;
      }
      if (quote) {
        if (text[i] === quote) quote = null;
        continue;
      }
      if (text[i] === "<") {
        angle = true;
        continue;
      }
      if ((text[i] === '"' || text[i] === "'") && /\s/u.test(text[i - 1])) {
        quote = text[i];
        continue;
      }
    }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

function destination(text, start, end) {
  while (start < end && /\s/u.test(text[start])) start++;
  while (end > start && /\s/u.test(text[end - 1])) end--;
  if (text[start] === "<") {
    const close = text.indexOf(">", start + 1);
    if (close < 0 || close > end) return null;
    return { start: start + 1, end: close, href: text.slice(start + 1, close) };
  }
  const inner = text.slice(start, end);
  const title = /\s+(?:"[^"]*"|'[^']*')$/u.exec(inner);
  if (title) end = start + title.index;
  return end > start ? { start, end, href: text.slice(start, end) } : null;
}

const referenceId = (value) => value.trim().replace(/\s+/gu, " ").toLowerCase();
const escapedAt = (text, index) => {
  let slashes = 0;
  while (text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
};
export function markdownLinks(text) {
  const visible = maskCode(text);
  const definitions = new Map();
  for (const match of visible.matchAll(
    /^[ \t]*\[([^\]\n]+)\]:[ \t]*(.*)$/gmu,
  )) {
    const start = match.index + match[0].length - match[2].length;
    const dest = destination(text, start, match.index + match[0].length);
    if (dest) {
      const nameStart = match.index + match[0].indexOf("[") + 1;
      const id = referenceId(match[1]);
      if (!definitions.has(id))
        definitions.set(id, {
          ...dest,
          definitionStart: nameStart,
          definitionEnd: nameStart + match[1].length,
        });
    }
  }
  const links = [];
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] === "\\") {
      i++;
      continue;
    }
    if (visible[i] !== "[") continue;
    const end = closing(visible, i, "[", "]");
    if (end < 0) continue;
    const label = text.slice(i + 1, end);
    const image = i > 0 && visible[i - 1] === "!" && !escapedAt(visible, i - 1);
    const next = visible[end + 1];
    if (next === ":") {
      i = end;
      continue;
    }
    if (next === "(") {
      const close = closing(visible, end + 1, "(", ")");
      if (close >= 0) {
        const dest = destination(text, end + 2, close);
        if (dest) links.push({ ...dest, image, label });
        // 可点击图片的外层链接不能吞掉内层图片；继续扫描标签，仍共享全文的引用定义。
        if (!label.includes("![")) i = close;
      }
    } else {
      let id = label;
      let refEnd = end;
      if (next === "[") {
        refEnd = closing(visible, end + 1, "[", "]");
        if (refEnd < 0) continue;
        id = text.slice(end + 2, refEnd) || label;
      }
      const dest = definitions.get(referenceId(id));
      if (dest)
        links.push({
          ...dest,
          image,
          label,
          reference: {
            id: referenceId(id),
            start: end + (next === "[" ? 2 : 1),
            end: next === "[" ? refEnd : end + 1,
            shortcut: next !== "[",
          },
        });
      if (!label.includes("![")) i = refEnd;
    }
  }
  return links;
}

export function namespaceReferences(text, prefix) {
  const changes = [];
  for (const match of maskCode(text).matchAll(
    /^[ \t]*\[([^\]\n]+)\]:[ \t]*(.*)$/gmu,
  )) {
    const start = match.index + match[0].indexOf("[") + 1;
    changes.push({
      start,
      end: start + match[1].length,
      value: prefix + ":" + referenceId(match[1]),
    });
  }
  for (const link of markdownLinks(text)) {
    if (!link.reference) continue;
    const name = prefix + ":" + link.reference.id;
    changes.push({
      start: link.definitionStart,
      end: link.definitionEnd,
      value: name,
    });
    changes.push({
      start: link.reference.start,
      end: link.reference.end,
      value: link.reference.shortcut ? "[" + name + "]" : name,
    });
  }
  return replaceSpans(text, changes);
}

export function replaceSpans(text, replacements) {
  const unique = new Map();
  for (const item of replacements) {
    const key = item.start + ":" + item.end;
    if (unique.has(key) && unique.get(key).value !== item.value)
      throw new Error("同一 Markdown 引用发生冲突。");
    unique.set(key, item);
  }
  let previous = text.length + 1;
  for (const item of [...unique.values()].sort((a, b) => b.start - a.start)) {
    if (item.end > previous) throw new Error("Markdown 改写范围发生重叠。");
    text = text.slice(0, item.start) + item.value + text.slice(item.end);
    previous = item.start;
  }
  return text;
}

export function decodeDestination(value) {
  try {
    return decodeURIComponent(value.replace(/\\([\\()[\] ])/gu, "$1"));
  } catch {
    throw new Error("图片或链接地址包含无效编码：" + value);
  }
}

// 与本仓库 PRD 阅读器保持同一锚点规则。合并时加上章号，避免跨模块同名标题碰撞。
export function headingSlug(value) {
  return (
    value
      .toLowerCase()
      .replace(/[\x60*_~[\]()#]/gu, "")
      .trim()
      .replace(/\s+/gu, "-")
      .replace(/[^\p{Letter}\p{Number}-]/gu, "")
      .replace(/-{2,}/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 64) || "sec"
  );
}

export function publicStorageUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/storage\/v1\/object\/public\/[^/]+\/.+/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}
