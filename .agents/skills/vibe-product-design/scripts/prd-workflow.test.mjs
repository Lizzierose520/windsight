import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mergePrd } from "./merge-prototype-prd.mjs";
import { prepareScreenshots, uploadAssets } from "./upload-prd-assets.mjs";
import {
  ASSET_MANIFEST,
  CONFIG_NAME,
  MAP_NAME,
  SCREENSHOTS_ROOT,
  markdownLinks,
  readText,
  sha256,
} from "./_prd-core.mjs";

const BASE = "https://example.supabase.co";
const REMOTE = BASE + "/storage/v1/object/public/prd-assets/example/shot.png";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=",
  "base64",
);
const KEY = "sb_secret_TEST_ONLY";

function fixture(t, { local = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-prd-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, ".context/vibe-product-design/example");
  fs.mkdirSync(path.join(dir, "modules"), { recursive: true });
  const screenshots = path.join(root, SCREENSHOTS_ROOT, "example");
  fs.mkdirSync(screenshots, { recursive: true });
  const image = path.join(screenshots, "关键定价 (优惠).png");
  fs.writeFileSync(image, PNG);
  const pricing = path.join(dir, "modules/10-pricing.md");
  const relative = path
    .relative(path.dirname(pricing), image)
    .split(path.sep)
    .join("/");
  const src = local ? relative : REMOTE;
  fs.writeFileSync(
    path.join(dir, "00-overview.md"),
    "# 产品整体\n\n原文承诺：主机费与模型费分开。\n",
  );
  fs.writeFileSync(
    path.join(dir, "20-host.md"),
    "# 主机管理\n\n## 状态\n\n已停止不代表文件已删除。\n",
  );
  fs.writeFileSync(
    pricing,
    [
      "# 定价策略",
      "",
      "## 状态",
      "",
      "共享主机按运行时间计量。",
      "",
      "![费用证据](<" + src + '> "真实业务说明")',
      "",
      "[再次查看][shot]",
      "![复用证据][shot]",
      "",
      "[shot]: <" + src + '> "引用式说明"',
      "",
      "[主机状态](../20-host.md#状态)",
      "",
      "| 状态 | 费用 |",
      "| --- | --- |",
      "| 停止 | 按已确认规则 |",
      "",
      String.fromCharCode(96).repeat(3) + "mermaid",
      "flowchart LR",
      'A["# 不能变成标题"] --> B["![不是截图](local.png)"]',
      String.fromCharCode(96).repeat(3),
      "",
      "行内示例 " +
        String.fromCharCode(96) +
        "![不是图](ignore.png)" +
        String.fromCharCode(96) +
        " 原样保留。",
      "",
    ].join("\n"),
  );
  const config = {
    schemaVersion: 1,
    title: "原型驱动 PRD",
    sections: [
      { id: "overview", file: "00-overview.md" },
      { id: "host", file: "20-host.md" },
      { id: "pricing", file: "modules/10-pricing.md", requireScreenshot: true },
    ],
  };
  fs.writeFileSync(
    path.join(dir, CONFIG_NAME),
    JSON.stringify(config, null, 2) + "\n",
  );
  return { root, dir, config, image, pricing, screenshots };
}

function storage({
  privateBucket = false,
  failUpload = false,
  failGetAfterUpload = false,
  onUpload,
} = {}) {
  const objects = new Map();
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    const headers = new Headers(options.headers);
    assert.equal(options.redirect, "error");
    if (url.startsWith("https://api.supabase.com/")) {
      return Response.json([{ type: "secret", name: "default", api_key: KEY }]);
    }
    assert.ok(url.startsWith(BASE + "/storage/v1/"));
    if (url.includes("/object/public/")) {
      assert.equal(headers.has("authorization"), false);
      assert.equal(headers.has("apikey"), false);
      const key = url.split("/object/public/prd-assets/")[1];
      if (failGetAfterUpload && objects.has(key))
        return new Response("故障", { status: 502 });
      return objects.has(key)
        ? new Response(objects.get(key), {
            headers: { "content-type": "image/png" },
          })
        : new Response("未找到", { status: 404 });
    }
    assert.equal(headers.get("apikey"), KEY);
    assert.equal(headers.has("authorization"), false); // 新 secret key 不是 JWT。
    if (url.endsWith("/bucket/prd-assets"))
      return Response.json({ public: !privateBucket });
    if (url.includes("/object/prd-assets/") && options.method === "POST") {
      if (failUpload) return new Response("上传失败", { status: 503 });
      objects.set(
        url.split("/object/prd-assets/")[1],
        Buffer.from(options.body),
      );
      onUpload?.();
      return Response.json({ Key: "已保存" });
    }
    throw new Error("意外请求：" + url);
  };
  return { fakeFetch, objects, calls };
}
const dependencies = (server, extra = {}) => ({
  fetchImpl: server.fakeFetch,
  env: { SUPABASE_URL: BASE, SUPABASE_SECRET_KEY: KEY, ...extra },
});

test("截图前写入忽略规则，保留原有规则且不忽略 PRD", (t) => {
  const f = fixture(t);
  assert.equal(spawnSync("git", ["init", "-q", f.root]).status, 0);
  fs.writeFileSync(
    path.join(f.root, ".gitignore"),
    "# 用户原有规则\n/custom-cache/\n",
  );
  const dir = prepareScreenshots(f.root, "example");
  assert.equal(dir, f.screenshots);
  assert.equal(
    dir,
    path.join(f.root, ".context/vibe-product-design/screenshots/example"),
  );
  assert.equal(fs.existsSync(path.join(f.root, "context")), false);
  const ignored = readText(path.join(f.root, ".gitignore"));
  prepareScreenshots(f.root, "example");
  assert.equal(readText(path.join(f.root, ".gitignore")), ignored);
  assert.ok(ignored.startsWith("# 用户原有规则\n/custom-cache/"));
  assert.equal(
    spawnSync("git", ["-C", f.root, "check-ignore", "-q", f.image]).status,
    0,
  );
  assert.equal(
    spawnSync("git", ["-C", f.root, "check-ignore", "-q", f.pricing]).status,
    1,
  );
});

test("已跟踪的截图不会被忽略规则假装移出索引", (t) => {
  const f = fixture(t);
  spawnSync("git", ["init", "-q", f.root]);
  assert.equal(spawnSync("git", ["-C", f.root, "add", f.image]).status, 0);
  assert.throws(() => prepareScreenshots(f.root, "example"), /已有 Git 跟踪/u);
});

test("按清单合并、保留正文和代码、转换跨模块链接，重复执行字节相同", (t) => {
  const f = fixture(t);
  const originals = f.config.sections.map((s) =>
    readText(path.join(f.dir, s.file)),
  );
  const first = mergePrd(f.dir);
  const second = mergePrd(f.dir);
  assert.equal(first.text, second.text);
  assert.equal(first.mapText, second.mapText);
  assert.ok(
    first.text.indexOf("## 2. 主机管理") < first.text.indexOf("## 3. 定价策略"),
  );
  assert.ok(first.text.includes("[主机状态](#21-状态)"));
  assert.ok(first.text.includes("| 停止 | 按已确认规则 |"));
  assert.ok(
    first.text.includes('A["# 不能变成标题"] --> B["![不是截图](local.png)"]'),
  );
  assert.ok(first.text.includes("![不是图](ignore.png)"));
  assert.deepEqual(
    f.config.sections.map((s) => readText(path.join(f.dir, s.file))),
    originals,
  );
  assert.equal(
    first.map.outputSha256,
    sha256(readText(path.join(f.dir, "PRD.md"))),
  );
  for (const item of first.map.sections) {
    for (const heading of item.headings) {
      assert.ok(
        first.text.split("\n")[heading.mergedLine - 1].endsWith(heading.title),
      );
    }
  }
  assert.doesNotThrow(() => mergePrd(f.dir, { check: true }));
});

test("来源修改和直接修改成稿都使 --check 失败，回改源再合并可恢复", (t) => {
  const f = fixture(t);
  mergePrd(f.dir);
  fs.appendFileSync(path.join(f.dir, "PRD.md"), "\n不应直接加到成稿。\n");
  assert.throws(() => mergePrd(f.dir, { check: true }), /不是当前子文档/u);
  mergePrd(f.dir);
  fs.appendFileSync(f.pricing, "\n价格版本仅向未来生效。\n");
  assert.throws(() => mergePrd(f.dir, { check: true }), /不是当前子文档/u);
  assert.ok(mergePrd(f.dir).text.includes("价格版本仅向未来生效"));
});

test("缺文件、重复清单、越界和漏列子 PRD 均不覆盖旧成稿", (t) => {
  const f = fixture(t);
  const before = mergePrd(f.dir).text;
  const configPath = path.join(f.dir, CONFIG_NAME);
  const valid = readText(configPath);
  for (const modify of [
    (c) => {
      c.sections[0].file = "missing.md";
    },
    (c) => {
      c.sections[1].id = c.sections[0].id;
    },
    (c) => {
      c.sections[1].file = c.sections[0].file;
    },
    (c) => {
      c.sections[0].file = "../outside.md";
    },
  ]) {
    const config = JSON.parse(valid);
    modify(config);
    fs.writeFileSync(configPath, JSON.stringify(config));
    assert.throws(() => mergePrd(f.dir));
    assert.equal(readText(path.join(f.dir, "PRD.md")), before);
  }
  fs.writeFileSync(configPath, valid);
  fs.writeFileSync(path.join(f.dir, "30-unlisted.md"), "# 未列出的模块\n");
  assert.throws(() => mergePrd(f.dir), /未列入 sections/u);
  assert.equal(readText(path.join(f.dir, "PRD.md")), before);
});

test("合并拒绝未上传图片、缺失关键截图、错误锚点和未闭合代码块", (t) => {
  const f = fixture(t, { local: true });
  assert.throws(() => mergePrd(f.dir), /先上传再合并/u);
  fs.writeFileSync(f.pricing, "# 定价\n\n没有关键截图。\n");
  assert.throws(() => mergePrd(f.dir), /缺少.*关键截图/u);
  fs.writeFileSync(
    f.pricing,
    "# 定价\n\n![证据](" + REMOTE + ")\n[状态](../20-host.md#不存在)\n",
  );
  assert.throws(() => mergePrd(f.dir), /不存在的子文档标题/u);
  fs.appendFileSync(
    f.pricing,
    "\n" + String.fromCharCode(96).repeat(3) + "js\nconst x = 1;\n",
  );
  assert.throws(() => mergePrd(f.dir), /未闭合/u);
});

test("本地截图上传、回写引用式图片、幂等复用、换图重传、重合并完整链路", async (t) => {
  const f = fixture(t, { local: true });
  const server = storage();
  const options = { projectDir: f.root, doc: "example" };
  const first = await uploadAssets(options, dependencies(server));
  assert.equal(first.uploaded, 1);
  assert.equal(server.objects.size, 1);
  const source = readText(f.pricing);
  assert.ok(source.includes('"真实业务说明"'));
  assert.ok(source.includes('"引用式说明"'));
  assert.ok(source.includes("![不是图](ignore.png)"));
  assert.ok(source.includes(BASE + "/storage/v1/object/public/prd-assets/"));
  assert.equal(markdownLinks(source).filter((l) => l.image).length, 2);
  const initial = mergePrd(f.dir);
  const repeated = await uploadAssets(options, dependencies(server));
  assert.equal(repeated.uploaded, 0);
  assert.equal(repeated.reused, 1);
  assert.equal(readText(f.pricing), source);
  fs.writeFileSync(
    f.image,
    Buffer.concat([PNG, Buffer.from("updated-test-image")]),
  );
  await assert.rejects(
    () => uploadAssets({ ...options, check: true }, dependencies(server)),
    /本地配图已更新/u,
  );
  assert.equal((await uploadAssets(options, dependencies(server))).uploaded, 1);
  assert.equal(server.objects.size, 2);
  assert.notEqual(readText(f.pricing), source);
  assert.throws(() => mergePrd(f.dir, { check: true }), /不是当前子文档/u);
  const current = mergePrd(f.dir);
  assert.notEqual(current.map.outputSha256, initial.map.outputSha256);
  assert.equal(
    (await uploadAssets({ ...options, check: true }, dependencies(server)))
      .checked,
    true,
  );
});

for (const setting of [
  { failUpload: true },
  { failGetAfterUpload: true },
  { privateBucket: true },
]) {
  test(
    "上传/GET/私有 bucket 失败不改源文档和图片清单：" + JSON.stringify(setting),
    async (t) => {
      const f = fixture(t, { local: true });
      const before = readText(f.pricing);
      const server = storage(setting);
      await assert.rejects(() =>
        uploadAssets(
          { projectDir: f.root, doc: "example" },
          dependencies(server),
        ),
      );
      assert.equal(readText(f.pricing), before);
      assert.equal(fs.existsSync(path.join(f.dir, ASSET_MANIFEST)), false);
      if (setting.privateBucket)
        assert.equal(
          server.calls.some((call) => call.options.method === "POST"),
          false,
        );
    },
  );
}

test("dry-run 和 check 不联网；临时图片不存在时预检失败", async (t) => {
  const f = fixture(t, { local: true });
  const offline = {
    env: {},
    fetchImpl: () => {
      throw new Error("不该联网");
    },
  };
  const before = readText(f.pricing);
  const result = await uploadAssets(
    { projectDir: f.root, doc: "example", dryRun: true },
    offline,
  );
  assert.equal(result.objects.length, 1);
  assert.equal(readText(f.pricing), before);
  await assert.rejects(
    () =>
      uploadAssets(
        { projectDir: f.root, doc: "example", check: true },
        offline,
      ),
    /未上传/u,
  );
  fs.unlinkSync(f.image);
  await assert.rejects(
    () => uploadAssets({ projectDir: f.root, doc: "example" }, offline),
    /图片不存在/u,
  );
});

test("上传期间有人修改源文档，不用旧文案覆盖新文案", async (t) => {
  const f = fixture(t, { local: true });
  const server = storage({
    onUpload: () => fs.appendFileSync(f.pricing, "\n用户刚修改的业务规则。\n"),
  });
  await assert.rejects(
    () =>
      uploadAssets(
        { projectDir: f.root, doc: "example" },
        dependencies(server),
      ),
    /发生变化/u,
  );
  assert.ok(readText(f.pricing).endsWith("用户刚修改的业务规则。\n"));
  assert.equal(fs.existsSync(path.join(f.dir, ASSET_MANIFEST)), false);
});

test("图片不能越出需求资产目录或经符号链接读取其他文件", async (t) => {
  const f = fixture(t, { local: true });
  const outside = path.join(f.root, "private.png");
  fs.writeFileSync(outside, PNG);
  fs.unlinkSync(f.image);
  fs.symlinkSync(outside, f.image);
  await assert.rejects(
    () =>
      uploadAssets(
        { projectDir: f.root, doc: "example", dryRun: true },
        { env: {} },
      ),
    /不在本需求/u,
  );
});

test("无直接密钥时复用 Management API 回退，公开 GET 始终不带凭据", async (t) => {
  const f = fixture(t, { local: true });
  const server = storage();
  await uploadAssets(
    { projectDir: f.root, doc: "example" },
    {
      fetchImpl: server.fakeFetch,
      env: { SUPABASE_URL: BASE, SUPABASE_ACCESS_TOKEN: "TEST_PAT" },
    },
  );
  const management = server.calls.find((call) =>
    call.url.startsWith("https://api.supabase.com/"),
  );
  assert.equal(
    new Headers(management.options.headers).get("authorization"),
    "Bearer TEST_PAT",
  );
});

test("整个资产目录的符号链接也不能绕开本需求的文件边界", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "private.png"), PNG);
  fs.symlinkSync(f.root, path.join(f.dir, "assets"));
  fs.writeFileSync(f.pricing, "# 定价\n\n![外部文件](../assets/private.png)\n");
  await assert.rejects(
    () =>
      uploadAssets(
        { projectDir: f.root, doc: "example", dryRun: true },
        { env: {} },
      ),
    /不在本需求/u,
  );
});

test("模式 B 无清单时仍可上传 assets 配图，已有远程图不要求本地副本", async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.dir, CONFIG_NAME));
  fs.mkdirSync(path.join(f.dir, "assets"));
  fs.writeFileSync(path.join(f.dir, "assets/design.png"), PNG);
  fs.writeFileSync(
    path.join(f.dir, "PRD.md"),
    "# 功能 PRD\n\n![原型](assets/design.png)\n",
  );
  const server = storage();
  await uploadAssets(
    { projectDir: f.root, doc: "example" },
    dependencies(server),
  );
  const prd = readText(path.join(f.dir, "PRD.md"));
  assert.ok(prd.includes("/storage/v1/object/public/prd-assets/"));
  fs.unlinkSync(path.join(f.dir, "assets/design.png"));
  await assert.doesNotReject(() =>
    uploadAssets(
      { projectDir: f.root, doc: "example", check: true },
      { env: {} },
    ),
  );
});

test("嵌套链接内的关键图片仍被识别，代码示例保持不动", () => {
  const source =
    "[![截图](<关键 (定价).png>)](https://example.com)\n" +
    String.fromCharCode(96) +
    "![示例](ignored.png)" +
    String.fromCharCode(96);
  assert.deepEqual(
    markdownLinks(source)
      .filter((l) => l.image)
      .map((l) => l.href),
    ["关键 (定价).png"],
  );
});

test("不同子文档的同名图片引用在成稿中保持独立", (t) => {
  const f = fixture(t);
  const second = BASE + "/storage/v1/object/public/prd-assets/example/host.png";
  fs.appendFileSync(
    path.join(f.dir, "20-host.md"),
    "\n![主机][shot]\n\n[shot]: " + second + "\n",
  );
  const merged = mergePrd(f.dir);
  const imageUrls = markdownLinks(merged.text)
    .filter((link) => link.image)
    .map((link) => link.href);
  assert.deepEqual(imageUrls, [second, REMOTE, REMOTE]);
  assert.ok(merged.text.includes("[host:shot]:"));
  assert.ok(merged.text.includes("[pricing:shot]:"));
});

test("列表内的图片必须上传，列表中的缩进代码仍原样保留", async (t) => {
  const f = fixture(t, { local: true });
  const rel = path
    .relative(path.dirname(f.pricing), f.image)
    .split(path.sep)
    .join("/");
  fs.writeFileSync(
    f.pricing,
    "# 定价\n\n![总览](" +
      REMOTE +
      ")\n\n- 计费状态\n\n    ![关键截图](<" +
      rel +
      ">)\n\n      ![代码示例](ignore.png)\n",
  );
  assert.throws(() => mergePrd(f.dir), /先上传/u);
  await assert.rejects(
    () =>
      uploadAssets(
        { projectDir: f.root, doc: "example", check: true },
        { env: {} },
      ),
    /未上传/u,
  );
  const server = storage();
  assert.equal(
    (
      await uploadAssets(
        { projectDir: f.root, doc: "example" },
        dependencies(server),
      )
    ).uploaded,
    1,
  );
  assert.ok(readText(f.pricing).includes("      ![代码示例](ignore.png)"));
  assert.doesNotThrow(() => mergePrd(f.dir));
});

test("多级小节序号的锚点碰撞按阅读器规则去重", (t) => {
  const f = fixture(t);
  const host = path.join(f.dir, "20-host.md");
  const lines = ["# 主机", "", "## 第一节", "", "### 状态"];
  for (let i = 2; i <= 10; i++) lines.push("", "## 第" + i + "节");
  lines.push("", "## 状态", "", "[早期状态](#状态)", "[后续状态](#状态-2)", "");
  fs.writeFileSync(host, lines.join("\n"));
  const result = mergePrd(f.dir);
  assert.ok(result.text.includes("[早期状态](#211-状态)"));
  assert.ok(result.text.includes("[后续状态](#211-状态-2)"));
  const anchors = result.map.sections.flatMap((s) =>
    s.headings.map((h) => h.anchor),
  );
  assert.equal(new Set(anchors).size, anchors.length);
});
