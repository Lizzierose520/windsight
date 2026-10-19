import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseArgs } from "./image-common.js";
import { ensureWorkspace, loadConfig } from "./workspace.mjs";

test("creates a trackable project config once and applies CLI > user > example precedence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-config-"));
  const previous = process.env.INIT_CWD;
  process.env.INIT_CWD = directory;
  try {
    execFileSync("git", ["init", "-q", directory]);
    const { configPath } = ensureWorkspace();
    const example = await readFile(new URL("../config.json.example", import.meta.url), "utf8");
    assert.equal(await readFile(configPath, "utf8"), example);
    assert.equal(spawnSync("git", ["-C", directory, "check-ignore", "--quiet", configPath]).status, 1);
    assert.equal(execFileSync("git", ["-C", directory, "ls-files", "--others", "--exclude-standard", "--", configPath], { encoding: "utf8" }).trim(), ".context/zenmux-image-generation/config.json");

    const custom = JSON.stringify({ generation: { model: "openai/gpt-image-1.5", count: 2, quality: "high" }, prompt: { mode: "reference" } });
    await writeFile(configPath, custom);
    ensureWorkspace();
    const effective = loadConfig();
    assert.equal(effective.generation.size, "1024x1024");
    assert.equal(effective.refresh.referencesIntervalHours, 168);
    assert.equal(effective.prompt.mode, "reference");
    const configured = parseArgs(["--prompt-file", "test.md"], { description: "test" }).common;
    assert.equal(configured.model, "openai/gpt-image-1.5");
    assert.equal(configured.n, 2);
    assert.equal(configured.quality, "high");
    const overridden = parseArgs(["--prompt-file", "test.md", "--model", "openai/gpt-image-2.5-flare", "--n", "1", "--quality", "low"], { description: "test" }).common;
    assert.equal(overridden.model, "openai/gpt-image-2.5-flare");
    assert.equal(overridden.n, 1);
    assert.equal(overridden.quality, "low");
    assert.equal(await readFile(configPath, "utf8"), custom, "reading/overrides never rewrite user settings");
    assert.equal(await readFile(new URL("../config.json.example", import.meta.url), "utf8"), example);

    const otherProject = await mkdtemp(path.join(tmpdir(), "zenmux-other-config-"));
    try {
      process.env.INIT_CWD = otherProject;
      assert.equal(loadConfig().generation.count, 4, "each project gets independent preferences");
      assert.equal(loadConfig().prompt.mode, "direct");
    } finally {
      await rm(otherProject, { recursive: true, force: true });
    }
  } finally {
    if (previous === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects invalid config without replacing it or silently using factory settings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-invalid-config-"));
  const previous = process.env.INIT_CWD;
  process.env.INIT_CWD = directory;
  try {
    const { configPath } = ensureWorkspace();
    for (const value of ["{bad-json", "null", '{"prompt":{"mode":"typo"}}', '{"generation":{"count":0}}', '{"refresh":{"modelsIntervalHours":-1}}', '{"refresh":{"autoUpdate":"false"}}', '{"generation":{"modle":"typo"}}']) {
      await writeFile(configPath, value);
      assert.throws(() => loadConfig(), /Invalid config at .*config\.json:/);
      assert.equal(await readFile(configPath, "utf8"), value);
    }
  } finally {
    if (previous === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
