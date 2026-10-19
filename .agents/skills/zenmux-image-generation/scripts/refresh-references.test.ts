import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("refresh intervals avoid network work, prompt modes select cookbooks, and failures back off", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "zenmux-refresh-"));
  const bin = path.join(directory, "bin");
  const runtime = path.join(directory, ".context/zenmux-image-generation");
  const log = path.join(directory, "requests.log");
  const configPath = path.join(runtime, "config.json");
  const statePath = path.join(runtime, "refresh-state.json");
  await mkdir(bin);
  await writeFile(log, "");
  await writeFile(path.join(bin, "curl"), `#!/usr/bin/env bash
target=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) target="$2"; shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s\\n' "$url" >> "$REFRESH_FIXTURES/requests.log"
if [ -f "$REFRESH_FIXTURES/fail" ]; then exit 22; fi
case "$url" in
  https://zenmux.ai/api/v1/models) printf '%s' '{"data":[{"id":"openai/test-image","output_modalities":["image"]}]}' ;;
  https://zenmux.ai/api/vertex-ai/v1beta/models) printf '%s' '{"models":[{"name":"google/test-image","outputModalities":["image"]}]}' ;;
  *) printf '# Fixture documentation\\n' > "$target" ;;
esac
`, { mode: 0o755 });
  const env = { ...process.env, INIT_CWD: directory, REFRESH_FIXTURES: directory, PATH: `${bin}:${process.env.PATH}` };
  const run = (script: string, ...args: string[]) => {
    const result = spawnSync("bash", [fileURLToPath(new URL(`./${script}`, import.meta.url)), ...args], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const requests = async () => (await readFile(log, "utf8")).split("\n").filter(Boolean);
  const resetLog = () => writeFile(log, "");
  const config = JSON.parse(await readFile(new URL("../config.json.example", import.meta.url), "utf8"));
  try {
    run("refresh_references.sh", "--quiet");
    assert.equal((await requests()).length, 8, "first direct run refreshes six docs and two catalogs");
    assert.ok((await requests()).every((url) => !url.includes("awesome-")));
    await assert.rejects(readFile(path.join(runtime, "references/awesome-gpt-image-2.md")), { code: "ENOENT" });
    await resetLog();
    run("refresh_references.sh", "--quiet");
    run("list_models.sh", "--names-only");
    assert.deepEqual(await requests(), [], "repeat use and model listing make no network requests");

    run("refresh_references.sh", "--prompt-mode", "reference", "--quiet");
    assert.equal((await requests()).length, 2, "switching mode downloads only the missing cookbooks");
    assert.ok((await requests()).every((url) => url.includes("awesome-")));
    assert.equal(JSON.parse(await readFile(configPath, "utf8")).prompt.mode, "direct", "one-off mode overrides are not persisted");
    config.prompt.mode = "reference";
    await writeFile(configPath, JSON.stringify(config));
    await resetLog();
    run("refresh_references.sh", "--quiet");
    assert.deepEqual(await requests(), []);

    config.refresh.modelsIntervalHours = 0;
    await writeFile(configPath, JSON.stringify(config));
    run("list_models.sh", "--json");
    run("list_models.sh", "--snapshot");
    assert.equal((await requests()).length, 4, "zero interval refreshes models on each call");
    config.refresh.modelsIntervalHours = 24;
    await writeFile(configPath, JSON.stringify(config));
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state["zenmux-image-generation.md"].lastSuccessAt = Date.now() - 169 * 3_600_000;
    await writeFile(statePath, JSON.stringify(state));
    await resetLog();
    run("refresh_references.sh", "--quiet");
    assert.equal((await requests()).length, 1, "only the expired resource is downloaded");
    assert.ok((await requests())[0]!.endsWith("image-generation.md"));

    config.refresh.autoUpdate = false;
    await writeFile(configPath, JSON.stringify(config));
    await resetLog();
    run("refresh_references.sh", "--quiet");
    run("list_models.sh", "--json");
    assert.deepEqual(await requests(), []);
    run("refresh_references.sh", "--force", "--quiet");
    assert.equal((await requests()).length, 10, "force bypasses autoUpdate and refreshes reference mode's eight files and two catalogs");

    config.refresh.autoUpdate = true;
    await writeFile(configPath, JSON.stringify(config));
    const before = JSON.parse(await readFile(statePath, "utf8"));
    for (const entry of Object.values(before) as { lastSuccessAt: number }[]) entry.lastSuccessAt = Date.now() - 169 * 3_600_000;
    await writeFile(statePath, JSON.stringify(before));
    const cachedDoc = await readFile(path.join(runtime, "references/zenmux-image-generation.md"), "utf8");
    await writeFile(path.join(directory, "fail"), "offline");
    await resetLog();
    run("refresh_references.sh", "--quiet");
    assert.equal((await requests()).length, 10);
    const failed = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(failed.models.lastSuccessAt, before.models.lastSuccessAt, "fallback is not a successful refresh");
    assert.equal(await readFile(path.join(runtime, "references/zenmux-image-generation.md"), "utf8"), cachedDoc);
    await resetLog();
    run("refresh_references.sh", "--quiet");
    run("list_models.sh", "--snapshot");
    assert.deepEqual(await requests(), [], "failed requests are not retried on every invocation");
    failed.models.lastAttemptAt = Date.now() - 61 * 60_000;
    await writeFile(statePath, JSON.stringify(failed));
    run("list_models.sh", "--snapshot");
    assert.equal((await requests()).length, 2, "failed requests can retry after the cooldown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
