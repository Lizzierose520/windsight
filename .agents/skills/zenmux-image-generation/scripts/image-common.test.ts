import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRunIdentity,
  deriveFilenamePrefix,
  ensureOutputDir,
  makeObjectFilename,
  openAIModelName,
  parseArgs,
  resolveUserPath,
  saveImage,
  slugifyObjectName,
  validateSize,
} from "./image-common.js";
import { ensureWorkspace } from "./workspace.mjs";

test("sanitizes semantic names to conservative object-storage characters", () => {
  assert.equal(slugifyObjectName("  产品 Launch / Summer 2026!!  "), "launch-summer-2026");
  assert.equal(slugifyObjectName("Café Portrait"), "cafe-portrait");
});

test("derives semantic prefix without duplicating prompt timestamp", () => {
  assert.equal(
    deriveFilenamePrefix(".context/zenmux-image-generation/prompts/20260831-143012-launch-poster.md"),
    "launch-poster",
  );
});

test("creates Supabase and S3 friendly collision-resistant filenames", () => {
  const filename = makeObjectFilename({
    prefix: "Launch Poster",
    model: "openai/gpt-image-2",
    timestamp: "20260831t143012345z",
    runId: "a1b2c3d4",
    index: 1,
    mimeType: "image/png",
  });
  assert.equal(filename, "launch-poster-openai-gpt-image-2-20260831t143012345z-a1b2c3d4-01.png");
  assert.match(filename, /^[a-z0-9][a-z0-9-]*\.(?:png|jpg|webp)$/);
  assert.doesNotMatch(filename, /(?:\.\.|[\\/\s])/);
});

test("uses UTC millisecond timestamps and random hex run ids", () => {
  const identity = createRunIdentity();
  assert.match(identity.timestamp, /^\d{8}t\d{9}z$/);
  assert.match(identity.runId, /^[a-f0-9]{8}$/);
});

test("normalizes provider-prefixed OpenAI model ids", () => {
  assert.equal(openAIModelName("openai/gpt-image-2"), "gpt-image-2");
});

test("resolves npm --prefix paths from the original invocation directory", () => {
  const previous = process.env.INIT_CWD;
  process.env.INIT_CWD = "/tmp/zenmux-project";
  try {
    assert.equal(resolveUserPath(".context/prompt.md"), "/tmp/zenmux-project/.context/prompt.md");
  } finally {
    if (previous === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = previous;
  }
});

test("validates gpt-image-2 custom dimensions", () => {
  assert.doesNotThrow(() => validateSize("openai/gpt-image-2", "1536x864", true));
  assert.throws(() => validateSize("openai/gpt-image-2", "1537x864", true), /divisible by 16/);
});

test("saves images in the invoking Git project and keeps runtime artifacts untracked", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-workspace-"));
  execFileSync("git", ["init", "-q", directory]);
  const project = directory;
  const previous = process.env.INIT_CWD;
  // npm changes cwd to the installed skill; INIT_CWD still identifies the user's project.
  process.env.INIT_CWD = project;
  try {
    const options = parseArgs(["--prompt-file", "prompt.md"], { description: "test" }).common;
    assert.equal(options.model, "openai/gpt-image-2.5-flare");
    const root = path.join(execFileSync("git", ["-C", project, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(), ".context/zenmux-image-generation");
    assert.equal(options.outputDir, path.join(root, "output"));
    const outputDir = await ensureOutputDir(options.outputDir);
    const image = await saveImage({
      data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=", "base64"),
      outputDir, prefix: "test", model: options.model,
      timestamp: "20260912t000000000z", runId: "a1b2c3d4", index: 1, fallbackMime: "image/png",
    });
    const prompt = path.join(root, "prompts/prompt.md");
    await writeFile(prompt, "A test image");
    for (const file of [image, prompt]) {
      execFileSync("git", ["-C", project, "check-ignore", "--quiet", file]);
    }
    const ignore = path.join(root, ".gitignore");
    const rules = await readFile(ignore, "utf8");
    await writeFile(ignore, `# Keep user comments\ncustom-rule\n${rules}`);
    const expected = await readFile(ignore, "utf8");
    ensureWorkspace();
    ensureWorkspace();
    assert.equal(await readFile(ignore, "utf8"), expected);
    process.env.INIT_CWD = path.join(root, "prompts");
    assert.equal(ensureWorkspace().root, root, "nested invocations use the Git root");
    const custom = parseArgs(["--prompt-file", prompt, "--output-dir", "./custom"], { description: "test" }).common;
    assert.equal(await ensureOutputDir(custom.outputDir), path.join(root, "prompts/custom"));
  } finally {
    if (previous === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses cwd outside Git when INIT_CWD is absent", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-no-git-"));
  const env = { ...process.env };
  delete env.INIT_CWD;
  try {
    const script = new URL("./workspace.mjs", import.meta.url);
    const root = execFileSync(process.execPath, [script.pathname], { cwd: directory, env, encoding: "utf8" }).trim();
    assert.equal(root, path.join(await realpath(directory), ".context/zenmux-image-generation"));
    assert.match(await readFile(path.join(root, ".gitignore"), "utf8"), /^\*$/m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
