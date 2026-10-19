#!/usr/bin/env node
/**
 * 从仓库原 prd:assets 脚本收进 skill 的共用上传器，供模式 B/D 使用。
 * 保留 prd-assets、Management API 凭据回退和中文对象键编码；用 Node 原生 fetch，
 * 避免 skill 搬到其他项目后依赖本仓库的 Supabase SDK 才能运行。
 * 图片按内容生成新键，匿名 GET 校验后才回写源 Markdown，失败不制造失效图片链接。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ASSET_MANIFEST,
  CONFIG_NAME,
  SCREENSHOTS_ROOT,
  atomicWrite,
  decodeDestination,
  isWithin,
  loadConfig,
  markdownLinks,
  posix,
  publicStorageUrl,
  readText,
  replaceSpans,
  sha256,
  walkFiles,
} from "./_prd-core.mjs";

const TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};
const SAFE = /^[A-Za-z0-9._!-]$/u;
export function encodeKeySegment(value) {
  return [...Buffer.from(value, "utf8")]
    .map((byte) => {
      const char = String.fromCharCode(byte);
      return SAFE.test(char)
        ? char
        : "*" + byte.toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}
const keyFor = (parts) => parts.map(encodeKeySegment).join("/");
const urlFor = (base, bucket, key) =>
  base + "/storage/v1/object/public/" + bucket + "/" + key;

function docId(value) {
  if (!value || value === "." || value === ".." || /[/\\\0]/u.test(value))
    throw new Error("--doc 必须是单个需求文件夹名。");
  return value;
}

function screenshotDirectory(
  projectDir,
  id,
  screenshotsRoot = SCREENSHOTS_ROOT,
) {
  if (path.isAbsolute(screenshotsRoot))
    throw new Error("截图根目录必须是项目内相对路径。");
  const base = path.resolve(projectDir, screenshotsRoot);
  if (!isWithin(projectDir, base) || base === projectDir)
    throw new Error("截图目录不能越出项目或等于项目根。");
  const dir = path.join(base, docId(id));
  let existing = dir;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  if (!isWithin(fs.realpathSync(projectDir), fs.realpathSync(existing)))
    throw new Error("截图目录的符号链接越出项目。");
  return { base, dir };
}

export function prepareScreenshots(
  projectDir,
  id,
  screenshotsRoot = SCREENSHOTS_ROOT,
) {
  projectDir = path.resolve(projectDir);
  const target = screenshotDirectory(projectDir, id, screenshotsRoot);
  const relative = posix(path.relative(projectDir, target.base));
  const tracked = spawnSync(
    "git",
    ["-C", projectDir, "ls-files", "-z", "--", relative],
    { encoding: "utf8" },
  );
  if (tracked.status === 0 && tracked.stdout) {
    throw new Error(
      "截图根目录内已有 Git 跟踪文件；忽略规则不会自动取消跟踪，请先处理已有索引。",
    );
  }
  const ignoreFile = path.join(projectDir, ".gitignore");
  const before = fs.existsSync(ignoreFile) ? readText(ignoreFile) : "";
  const rule = "/" + relative + "/*";
  if (!before.split(/\r?\n/u).includes(rule)) {
    atomicWrite(
      ignoreFile,
      before.replace(/\n*$/u, "") +
        "\n\n# 原型关键截图只保存在本机；PRD 使用 Supabase Storage 地址。\n" +
        rule +
        "\n",
    );
  }
  // 先写忽略规则，再创建可接收截图的目录，防止第一张图就被 git add 收进去。
  fs.mkdirSync(target.dir, { recursive: true });
  return target.dir;
}

function envFromFiles(projectDir, inherited) {
  const env = { ...inherited };
  for (const name of [".env.local", ".env"]) {
    const file = path.join(projectDir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of readText(file).split(/\r?\n/u)) {
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(
        line.trim(),
      );
      if (!match || env[match[1]] !== undefined) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else value = value.replace(/\s+#.*$/u, "").trim();
      env[match[1]] = value;
    }
  }
  return env;
}

function baseUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("SUPABASE_URL 必须是无凭据、无额外路径的 HTTPS 项目地址。");
  }
  return url.origin;
}

function docsFor(projectDir, selected) {
  const root = path.join(projectDir, ".context/vibe-product-design");
  if (!fs.existsSync(root)) throw new Error("PRD 产出根不存在：" + root);
  const ids = selected
    ? [docId(selected)]
    : fs
        .readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            !["config", "screenshots"].includes(entry.name),
        )
        .map((entry) => entry.name)
        .sort();
  return ids.map((id) => {
    const dir = path.join(root, id);
    if (
      !fs.existsSync(dir) ||
      !fs.statSync(dir).isDirectory() ||
      !isWithin(fs.realpathSync(root), fs.realpathSync(dir))
    )
      throw new Error("需求目录不存在或越界：" + id);
    const config = fs.existsSync(path.join(dir, CONFIG_NAME))
      ? loadConfig(dir)
      : null;
    const markdown = config
      ? config.sections.map((section) => section.source)
      : fs
          .readdirSync(dir)
          .filter((name) => name.endsWith(".md") && !name.startsWith("_review"))
          .map((name) => path.join(dir, name))
          .filter((file) => fs.statSync(file).isFile())
          .sort();
    const cacheFile = path.join(dir, ASSET_MANIFEST);
    const cache = fs.existsSync(cacheFile)
      ? JSON.parse(readText(cacheFile))
      : { schemaVersion: 1, assets: [] };
    if (cache.schemaVersion !== 1 || !Array.isArray(cache.assets))
      throw new Error("图片清单格式错误：" + cacheFile);
    return { id, dir, config, markdown, cache, cacheFile };
  });
}

function assetPath(doc, projectDir, target, screenshotDir) {
  const roots = [
    path.join(doc.dir, "assets"),
    path.join(doc.dir, "design"),
    screenshotDir,
  ];
  const root = roots.find((candidate) => isWithin(candidate, target));
  const type = TYPES[path.extname(target).toLowerCase()];
  if (
    !root ||
    !type ||
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile() ||
    !isWithin(fs.realpathSync(projectDir), fs.realpathSync(target)) ||
    !isWithin(
      fs.realpathSync(
        root === screenshotDir ? path.dirname(screenshotDir) : doc.dir,
      ),
      fs.realpathSync(root),
    ) ||
    !isWithin(fs.realpathSync(root), fs.realpathSync(target))
  ) {
    throw new Error(
      "图片不存在、类型不支持或不在本需求的 assets/design/截图目录：" +
        posix(path.relative(projectDir, target)),
    );
  }
  const rel =
    root === screenshotDir
      ? "screenshots/" + posix(path.relative(root, target))
      : posix(path.relative(doc.dir, target));
  const body = fs.readFileSync(target);
  if (!body.length) throw new Error("图片为空：" + target);
  const hash = sha256(body);
  const ext = path.extname(rel);
  const parts = rel.slice(0, -ext.length).split("/");
  parts[parts.length - 1] += "-" + hash.slice(0, 20) + ext;
  return {
    source: posix(path.relative(projectDir, target)),
    target,
    body,
    hash,
    type,
    key: keyFor([doc.id, ...parts]),
  };
}

function planDoc(doc, options, base, bucket) {
  const screenshotDir = screenshotDirectory(
    options.projectDir,
    doc.id,
    options.screenshotsRoot ?? doc.config?.screenshotsRoot ?? SCREENSHOTS_ROOT,
  ).dir;
  const previous = new Map(
    doc.cache.assets.map((asset) => [asset.url, asset.source]),
  );
  // 兼容迁移前的对象键；只处理确实被正文引用的图片，不把整个历史图目录重复上传。
  if (base)
    for (const root of [
      path.join(doc.dir, "assets"),
      path.join(doc.dir, "design"),
    ]) {
      for (const file of walkFiles(root).filter(
        (item) => TYPES[path.extname(item).toLowerCase()],
      )) {
        previous.set(
          urlFor(
            base,
            bucket,
            keyFor([doc.id, ...posix(path.relative(doc.dir, file)).split("/")]),
          ),
          posix(path.relative(options.projectDir, file)),
        );
      }
    }
  const assets = new Map();
  const files = [];
  for (const file of doc.markdown) {
    const before = readText(file);
    const bindings = [];
    for (const link of markdownLinks(before).filter((item) => item.image)) {
      let target;
      if (/^https:\/\//iu.test(link.href)) {
        if (doc.config && !publicStorageUrl(link.href))
          throw new Error(
            "模式 D 图片必须使用稳定的 Supabase 公共 Storage 地址：" + file,
          );
        const known = previous.get(link.href);
        if (known && fs.existsSync(path.resolve(options.projectDir, known)))
          target = path.resolve(options.projectDir, known);
        else continue; // 已上传图片在另一台机器上没有本地副本，仍可正常使用。
      } else {
        if (
          /^[a-z][a-z0-9+.-]*:/iu.test(link.href) ||
          link.href.startsWith("#") ||
          link.href.startsWith("//")
        ) {
          throw new Error("不支持的图片地址：" + link.href);
        }
        target = path.resolve(path.dirname(file), decodeDestination(link.href));
      }
      if (!assets.has(target))
        assets.set(
          target,
          assetPath(doc, options.projectDir, target, screenshotDir),
        );
      bindings.push({ ...link, target });
    }
    files.push({ file, before, bindings });
  }
  return { ...doc, files, assets: [...assets.values()] };
}

async function request(fetchImpl, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
}

async function writeKey(env, base, fetchImpl) {
  const direct = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (direct) return direct.trim();
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\./iu.exec(base)?.[1];
  if (!ref || !env.SUPABASE_ACCESS_TOKEN)
    throw new Error(
      "缺少 Storage 写入凭据：配置 SERVICE_ROLE/SECRET_KEY 或 SUPABASE_ACCESS_TOKEN。",
    );
  for (const suffix of ["?reveal=true", ""]) {
    const response = await request(
      fetchImpl,
      "https://api.supabase.com/v1/projects/" + ref + "/api-keys" + suffix,
      { headers: { Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN } },
    );
    if (!response.ok) continue;
    const parsed = await response.json();
    const keys = Array.isArray(parsed)
      ? parsed
      : (parsed.keys ?? parsed.apiKeys ?? parsed.data ?? []);
    if (!Array.isArray(keys)) continue;
    const picked = keys.find(
      (key) =>
        (key.name === "service_role" || key.type === "secret") &&
        typeof key.api_key === "string" &&
        key.api_key &&
        !key.api_key.includes("*"),
    );
    if (picked) return picked.api_key;
  }
  throw new Error(
    "Management API 未提供可用写入密钥；响应内容不会打印，以免暴露密钥。",
  );
}

async function ensureBucket(base, bucket, headers, fetchImpl) {
  const response = await request(
    fetchImpl,
    base + "/storage/v1/bucket/" + bucket,
    { headers },
  );
  if (response.ok) {
    if (!(await response.json()).public)
      throw new Error(
        "目标 bucket 是私有的；本脚本不会把已有私有资产改为公开。",
      );
    return;
  }
  if (response.status !== 404)
    throw new Error("读取 Storage bucket 失败：HTTP " + response.status);
  const created = await request(fetchImpl, base + "/storage/v1/bucket", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 50 * 1024 * 1024,
    }),
  });
  if (!created.ok)
    throw new Error("创建 Storage bucket 失败：HTTP " + created.status);
}

async function publicHash(url, fetchImpl) {
  // 公开图校验永远不携带管理凭据，并验证图像类型和内容，不能只拼 URL 就当上传成功。
  const response = await request(fetchImpl, url);
  // 这个 Supabase 项目对不存在的对象返回 HTTP 400 + NoSuchKey 正文
  // （而不是 404），所以 400 也要先读正文判定「不存在」再当错误抛。
  const buf = Buffer.from(await response.arrayBuffer());
  if (response.status === 404) return null;
  if (response.status === 400) {
    const body = buf.toString("utf8");
    if (body.includes("NoSuchKey") || body.includes("not_found")) return null;
    throw new Error(
      "公开图片 GET 校验失败：HTTP 400 " + body.slice(0, 200),
    );
  }
  if (
    !response.ok ||
    !(response.headers.get("content-type") ?? "").startsWith("image/")
  ) {
    throw new Error("公开图片 GET 校验失败：HTTP " + response.status);
  }
  return sha256(buf);
}

export async function uploadAssets(options, dependencies = {}) {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  options = { ...options, projectDir };
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const env = envFromFiles(projectDir, dependencies.env ?? process.env);
  const base = baseUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const bucket = options.bucket ?? "prd-assets";
  if (!/^[A-Za-z0-9._-]+$/u.test(bucket))
    throw new Error("bucket 名称格式无效。");
  const docs = docsFor(projectDir, options.doc);
  if (options.check) {
    for (const doc of docs) {
      const cached = new Map(
        doc.cache.assets.map((asset) => [asset.url, asset]),
      );
      const screenshotDir = screenshotDirectory(
        projectDir,
        doc.id,
        options.screenshotsRoot ??
          doc.config?.screenshotsRoot ??
          SCREENSHOTS_ROOT,
      ).dir;
      for (const file of doc.markdown) {
        for (const link of markdownLinks(readText(file)).filter(
          (item) => item.image,
        )) {
          if (
            doc.config
              ? !publicStorageUrl(link.href)
              : !/^https:\/\//iu.test(link.href)
          ) {
            throw new Error(
              "文档仍有未上传或非稳定地址的配图：" +
                posix(path.relative(projectDir, file)),
            );
          }
          const known = cached.get(link.href);
          if (known && fs.existsSync(path.resolve(projectDir, known.source))) {
            const local = assetPath(
              doc,
              projectDir,
              path.resolve(projectDir, known.source),
              screenshotDir,
            );
            if (local.hash !== known.sha256 || local.key !== known.key) {
              throw new Error("本地配图已更新但尚未上传回写：" + known.source);
            }
          }
        }
      }
    }
    return {
      docs: docs.length,
      uploaded: 0,
      reused: 0,
      rewritten: 0,
      checked: true,
    };
  }
  const plans = docs.map((doc) => planDoc(doc, options, base, bucket));
  const allAssets = plans.flatMap((doc) => doc.assets);
  if (options.dryRun)
    return {
      dryRun: true,
      docs: docs.length,
      objects: allAssets.map((asset) => asset.key),
    };
  if (!allAssets.length)
    return { docs: docs.length, uploaded: 0, reused: 0, rewritten: 0 };
  if (!base) throw new Error("缺少 SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL。");
  const key = await writeKey(env, base, fetchImpl);
  const headers = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  await ensureBucket(base, bucket, headers, fetchImpl);
  let uploaded = 0;
  let reused = 0;
  for (const asset of allAssets) {
    asset.url = urlFor(base, bucket, asset.key);
    if (
      !options.force &&
      (await publicHash(asset.url, fetchImpl)) === asset.hash
    ) {
      reused++;
      continue;
    }
    const response = await request(
      fetchImpl,
      base + "/storage/v1/object/" + bucket + "/" + asset.key,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": asset.type,
          "cache-control": "max-age=31536000",
          "x-upsert": options.force ? "true" : "false",
        },
        body: asset.body,
      },
    );
    if (!response.ok && ![400, 409].includes(response.status))
      throw new Error("上传图片失败：HTTP " + response.status);
    if ((await publicHash(asset.url, fetchImpl)) !== asset.hash)
      throw new Error("上传后图片内容不一致，源 PRD 未改写。");
    uploaded++;
  }
  // 所有上传和 GET 都成功后才回写。上传期间有人修改文案或图片时，不覆盖其新版本。
  for (const doc of plans) {
    if (
      doc.files.some((file) => readText(file.file) !== file.before) ||
      doc.assets.some(
        (asset) => sha256(fs.readFileSync(asset.target)) !== asset.hash,
      )
    ) {
      throw new Error(
        "上传期间源文档或图片发生变化，本次未回写；重新执行即可复用已上传对象。",
      );
    }
  }
  let rewritten = 0;
  for (const doc of plans) {
    const byPath = new Map(doc.assets.map((asset) => [asset.target, asset]));
    for (const file of doc.files) {
      const patches = file.bindings
        .map((binding) => ({
          start: binding.start,
          end: binding.end,
          value: byPath.get(binding.target).url,
        }))
        .filter(
          (item) => file.before.slice(item.start, item.end) !== item.value,
        );
      if (patches.length) {
        atomicWrite(file.file, replaceSpans(file.before, patches));
        rewritten += patches.length;
      }
    }
    if (doc.assets.length) {
      const cache = new Map(
        doc.cache.assets.map((asset) => [asset.source, asset]),
      );
      for (const asset of doc.assets)
        cache.set(asset.source, {
          source: asset.source,
          sha256: asset.hash,
          key: asset.key,
          url: asset.url,
        });
      atomicWrite(
        doc.cacheFile,
        JSON.stringify(
          {
            schemaVersion: 1,
            assets: [...cache.values()].sort((a, b) =>
              a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
            ),
          },
          null,
          2,
        ) + "\n",
      );
    }
  }
  return { docs: docs.length, uploaded, reused, rewritten };
}

export async function runUploadCli(
  argv = process.argv.slice(2),
  defaults = {},
) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "用法：node upload-prd-assets.mjs [--project-dir 项目] [--doc 需求名] [--prepare | --check | --dry-run] [--force] [--screenshots-root 相对目录] [--bucket 名称]",
    );
    return;
  }
  const options = { projectDir: defaults.projectDir ?? process.cwd() };
  const values = {
    "--project-dir": "projectDir",
    "--doc": "doc",
    "--screenshots-root": "screenshotsRoot",
    "--bucket": "bucket",
  };
  for (let i = 0; i < argv.length; i++) {
    if (values[argv[i]]) {
      const flag = argv[i];
      if (!argv[i + 1] || argv[i + 1].startsWith("--"))
        throw new Error(flag + " 缺少参数。");
      options[values[flag]] = argv[++i];
    } else if (
      ["--prepare", "--check", "--dry-run", "--force"].includes(argv[i])
    ) {
      options[argv[i] === "--dry-run" ? "dryRun" : argv[i].slice(2)] = true;
    } else throw new Error("未知参数：" + argv[i]);
  }
  if (
    [options.prepare, options.check, options.dryRun].filter(Boolean).length > 1
  )
    throw new Error("--prepare、--check、--dry-run 不能同时使用。");
  if (options.prepare) {
    if (!options.doc) throw new Error("--prepare 需要 --doc 需求名。");
    const configFile = path.resolve(
      options.projectDir,
      ".context/vibe-product-design",
      docId(options.doc),
      CONFIG_NAME,
    );
    const config = fs.existsSync(configFile)
      ? JSON.parse(readText(configFile))
      : {};
    console.log(
      "忽略规则已就位，截图目录：" +
        prepareScreenshots(
          options.projectDir,
          options.doc,
          options.screenshotsRoot ?? config.screenshotsRoot,
        ),
    );
    return;
  }
  const result = await uploadAssets(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.rewritten)
    console.log(
      "图片地址已写回源文档；模式 D 请重新合并 PRD.md 并对完整成稿做全局 review。",
    );
  if (result.checked)
    console.log("配图地址检查通过（本地检查，不发送网络请求）。");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runUploadCli();
  } catch (error) {
    console.error("✕ " + error.message);
    process.exitCode = 1;
  }
}
