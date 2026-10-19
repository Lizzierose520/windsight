#!/usr/bin/env node
// Per-resource refresh timestamps keep unchanged references off the network.
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getWorkspacePaths, loadConfig } from "./workspace.mjs";

/** @typedef {{lastAttemptAt?: number, lastSuccessAt?: number, status?: string}} RefreshEntry */

/** @returns {Record<string, RefreshEntry>} */
function readState() {
  try {
    const state = JSON.parse(readFileSync(getWorkspacePaths().refreshStatePath, "utf8"));
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Expected an object");
    return state;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      console.error("warning: invalid refresh-state.json; refresh timestamps will be rebuilt");
    }
    return {};
  }
}

/** @param {"references" | "models"} kind
 * @param {string} key
 * @param {boolean} hasCache
 * @param {boolean} force
 * @param {number} [now]
 */
export function refreshDecision(kind, key, hasCache, force, now = Date.now()) {
  const { refresh } = loadConfig();
  if (force) return "refresh";
  if (!refresh.autoUpdate) return "disabled";
  const entry = readState()[key];
  const interval = (kind === "models" ? refresh.modelsIntervalHours : refresh.referencesIntervalHours) * 3_600_000;
  const age = now - (entry?.lastSuccessAt ?? NaN);
  if (hasCache && age >= 0 && age < interval) return "cached";
  const attemptAge = now - (entry?.lastAttemptAt ?? NaN);
  if (hasCache && entry?.status === "attempted" && attemptAge >= 0 && attemptAge < refresh.retryIntervalMinutes * 60_000) return "retry-later";
  return "refresh";
}

/** @param {string} key
 * @param {boolean} success
 */
export function recordRefresh(key, success) {
  loadConfig();
  const state = readState();
  const previous = state[key];
  const now = Date.now();
  state[key] = {
    ...(previous && Number.isFinite(previous.lastSuccessAt) ? { lastSuccessAt: previous.lastSuccessAt } : {}),
    lastAttemptAt: success ? (previous?.lastAttemptAt ?? now) : now,
    status: success ? "success" : "attempted",
    ...(success ? { lastSuccessAt: now } : {}),
  };
  const target = getWorkspacePaths().refreshStatePath;
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, key, kind, cached, force] = process.argv.slice(2);
    if (!key) throw new Error("Missing refresh resource key.");
    if (command === "check" && (kind === "references" || kind === "models")) {
      console.log(refreshDecision(kind, key, cached === "yes", force === "--force"));
    } else if (command === "attempt" || command === "success") {
      recordRefresh(key, command === "success");
    } else throw new Error("Usage: refresh-state.mjs check <key> <references|models> <yes|no> [--force], or attempt|success <key>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
