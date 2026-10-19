import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("merges both live catalogs and preserves valid snapshots during partial and total outages", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-catalog-"));
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  await writeFile(path.join(bin, "curl"), `#!/usr/bin/env bash
for endpoint; do :; done
case "$endpoint" in
  https://zenmux.ai/api/v1/models) cat "$MODEL_FIXTURES/openai.json" ;;
  https://zenmux.ai/api/vertex-ai/v1beta/models) cat "$MODEL_FIXTURES/vertex.json" ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
  const openai = path.join(directory, "openai.json");
  const vertex = path.join(directory, "vertex.json");
  const snapshot = path.join(directory, ".context/zenmux-image-generation/references/zenmux-image-models.json");
  const script = fileURLToPath(new URL("./list_models.sh", import.meta.url));
  const run = (mode = "--snapshot") => {
    const result = spawnSync("bash", [script, mode, "--force"], {
      encoding: "utf8", cwd: directory,
      env: { ...process.env, INIT_CWD: directory, MODEL_FIXTURES: directory, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  try {
    await writeFile(openai, JSON.stringify({ data: [
      { id: "openai/gpt-image-2.5-flare", output_modalities: ["image"], input_modalities: ["text", "image"] },
      { id: "test/text-only", output_modalities: ["text"] },
    ] }));
    await writeFile(vertex, JSON.stringify({ models: [
      { name: "openai/gpt-image-2.5-flare", outputModalities: ["image"] },
      { name: "google/test-image", outputModalities: ["image"], inputModalities: ["text"] },
    ] }));
    const live = run();
    assert.equal(live.stderr, "");
    const models = JSON.parse(live.stdout) as { name: string }[];
    assert.deepEqual(models.map((model) => model.name), ["google/test-image", "openai/gpt-image-2.5-flare"]);
    assert.deepEqual(JSON.parse(await readFile(snapshot, "utf8")), models);
    assert.equal(run("--names-only").stdout.trim(), "google/test-image\nopenai/gpt-image-2.5-flare");
    assert.equal(JSON.parse(run("--json").stdout)[1].family, "openai");

    await writeFile(vertex, "<html>upstream unavailable</html>");
    const partial = run();
    assert.match(partial.stderr, /partial live catalog/);
    assert.equal(JSON.parse(partial.stdout).length, 2, "cached Vertex models survive a partial outage");
    const cached = await readFile(snapshot, "utf8");
    await writeFile(openai, '{"data":[]}');
    const offline = run();
    assert.match(offline.stderr, /offline model snapshot/);
    assert.equal(await readFile(snapshot, "utf8"), cached, "empty/invalid catalogs cannot overwrite the cache");
    await rm(snapshot);
    const bundled = run();
    assert.match(bundled.stderr, /offline model snapshot/);
    assert.ok(JSON.parse(bundled.stdout).some((model: { name: string }) => model.name === "openai/gpt-image-2.5-flare"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
