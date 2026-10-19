#!/usr/bin/env node
// Shared project-local paths for the shell and TypeScript entrypoints.
import { execFileSync } from "node:child_process";
import { appendFileSync, constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_EXAMPLE = new URL("../config.json.example", import.meta.url);

/** @typedef {{
 * generation: {model: string, count: number, size: string, quality: string, outputFormat: string},
 * prompt: {mode: "direct" | "reference"},
 * refresh: {autoUpdate: boolean, referencesIntervalHours: number, modelsIntervalHours: number, retryIntervalMinutes: number}
 * }} SkillConfig */

export function getInvocationDir() {
  return path.resolve(process.env.INIT_CWD || process.cwd());
}

export function getWorkspacePaths() {
  let projectRoot = getInvocationDir();
  try {
    projectRoot = execFileSync("git", ["-C", projectRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // A non-Git project uses the original invocation directory.
  }
  const root = path.join(projectRoot, ".context", "zenmux-image-generation");
  return {
    root,
    configPath: path.join(root, "config.json"),
    refreshStatePath: path.join(root, "refresh-state.json"),
    outputDir: path.join(root, "output"),
    promptsDir: path.join(root, "prompts"),
    referencesDir: path.join(root, "references"),
    assetsDir: path.join(root, "assets"),
  };
}

export function ensureWorkspace() {
  const paths = getWorkspacePaths();
  mkdirSync(paths.root, { recursive: true });
  const ignorePath = path.join(paths.root, ".gitignore");
  const rules = "# ZenMux image-generation runtime files\n*\n!.gitignore\n!config.json\n";
  try {
    writeFileSync(ignorePath, rules, { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    if (!readFileSync(ignorePath, "utf8").endsWith(rules)) {
      appendFileSync(ignorePath, `\n${rules}`);
    }
  }
  for (const directory of [paths.outputDir, paths.promptsDir, paths.referencesDir, paths.assetsDir]) {
    mkdirSync(directory, { recursive: true });
  }
  try {
    copyFileSync(CONFIG_EXAMPLE, paths.configPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  }
  return paths;
}

/** Read effective settings without rewriting the user's file.
 * @returns {SkillConfig}
 */
export function loadConfig() {
  const { configPath } = ensureWorkspace();
  try {
    const defaults = JSON.parse(readFileSync(CONFIG_EXAMPLE, "utf8"));
    const user = JSON.parse(readFileSync(configPath, "utf8"));
    if (!user || typeof user !== "object" || Array.isArray(user)) throw new Error("Expected a JSON object.");
    for (const key of Object.keys(user)) {
      if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown setting: ${key}`);
    }
    for (const section of Object.keys(defaults)) {
      if (user[section] === undefined) continue;
      if (!user[section] || typeof user[section] !== "object" || Array.isArray(user[section])) {
        throw new Error(`${section} must be an object.`);
      }
      for (const key of Object.keys(user[section])) {
        if (!Object.hasOwn(defaults[section], key)) throw new Error(`Unknown setting: ${section}.${key}`);
      }
    }
    const config = {
      generation: { ...defaults.generation, ...user.generation },
      prompt: { ...defaults.prompt, ...user.prompt },
      refresh: { ...defaults.refresh, ...user.refresh },
    };
    const { generation, prompt, refresh } = config;
    if (typeof generation.model !== "string" || !generation.model.trim()) throw new Error("generation.model must be a non-empty string.");
    if (!Number.isInteger(generation.count) || generation.count < 1 || generation.count > 10) throw new Error("generation.count must be an integer from 1 to 10.");
    if (typeof generation.size !== "string" || !/^(auto|[1-9]\d*x[1-9]\d*)$/.test(generation.size)) throw new Error("generation.size must be auto or WIDTHxHEIGHT.");
    if (!["low", "medium", "high", "auto"].includes(generation.quality)) throw new Error("Invalid generation.quality.");
    if (!["png", "jpeg", "webp"].includes(generation.outputFormat)) throw new Error("Invalid generation.outputFormat; use png, jpeg, or webp.");
    if (!["direct", "reference"].includes(prompt.mode)) throw new Error("prompt.mode must be direct or reference.");
    if (typeof refresh.autoUpdate !== "boolean") throw new Error("refresh.autoUpdate must be a boolean.");
    for (const key of ["referencesIntervalHours", "modelsIntervalHours", "retryIntervalMinutes"]) {
      if (!Number.isFinite(refresh[key]) || refresh[key] < 0) throw new Error(`refresh.${key} must be a non-negative number.`);
    }
    return config;
  } catch (error) {
    throw new Error(`Invalid config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const option = process.argv[2];
    if (process.argv.length > 3 || (option && !["--config", "--help"].includes(option))) throw new Error("Usage: workspace.mjs [--config|--help]");
    if (option === "--help") console.log("Usage: workspace.mjs [--config] — initialize workspace or print effective project config");
    else {
      const config = loadConfig();
      console.log(option === "--config" ? JSON.stringify(config, null, 2) : getWorkspacePaths().root);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
