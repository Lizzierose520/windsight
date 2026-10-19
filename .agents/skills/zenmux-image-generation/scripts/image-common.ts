import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureWorkspace, getInvocationDir, getWorkspacePaths, loadConfig } from "./workspace.mjs";

export const ZENMUX_API_KEY_ENV = "ZENMUX_API_KEY";
export const ZENMUX_OPENAI_BASE_URL = "https://zenmux.ai/api/v1";
export const ZENMUX_GEMINI_BASE_URL = "https://zenmux.ai/api/vertex-ai";

const GPT_IMAGE_2_MIN_PIXELS = 655_360;
const GPT_IMAGE_2_MAX_PIXELS = 8_294_400;
const PRESET_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);
const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;

export type OutputFormat = "png" | "jpeg" | "webp";
export type Quality = "low" | "medium" | "high" | "auto";

export interface ReferenceImage {
  source: string;
  data: Buffer;
  mimeType: string;
  filename: string;
}

export interface CommonOptions {
  model: string;
  promptFile: string;
  outputDir: string;
  n: number;
  size: string;
  quality: Quality;
  outputFormat: OutputFormat;
  compression?: number;
  referenceImages: string[];
  maskImage?: string;
  filenamePrefix?: string;
  help: boolean;
}

interface ParseConfig {
  description: string;
  extraBoolean?: Set<string>;
  extraValue?: Set<string>;
}

export interface ParsedArgs {
  common: CommonOptions;
  extras: Map<string, string | boolean>;
}

function fail(message: string): never {
  throw new Error(message);
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`Missing value for ${flag}.`);
  return value;
}

export function parseArgs(argv: string[], config: ParseConfig): ParsedArgs {
  const defaults = loadConfig().generation;
  const common: CommonOptions = {
    model: defaults.model,
    promptFile: "",
    outputDir: getWorkspacePaths().outputDir,
    n: defaults.count,
    size: defaults.size,
    quality: parseQuality(defaults.quality),
    outputFormat: parseOutputFormat(defaults.outputFormat),
    referenceImages: [],
    help: false,
  };
  const extras = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag) continue;
    if (flag === "--help" || flag === "-h") {
      common.help = true;
      continue;
    }
    if (config.extraBoolean?.has(flag)) {
      extras.set(flag, true);
      continue;
    }
    if (config.extraValue?.has(flag)) {
      extras.set(flag, takeValue(argv, i, flag));
      i += 1;
      continue;
    }
    const value = takeValue(argv, i, flag);
    i += 1;
    switch (flag) {
      case "--model": common.model = value; break;
      case "--prompt-file": common.promptFile = value; break;
      case "--output-dir": common.outputDir = value; break;
      case "--n": common.n = Number.parseInt(value, 10); break;
      case "--size": common.size = value; break;
      case "--quality": common.quality = parseQuality(value); break;
      case "--output-format": common.outputFormat = parseOutputFormat(value); break;
      case "--compression": common.compression = Number.parseInt(value, 10); break;
      case "--reference-image": common.referenceImages.push(value); break;
      case "--mask-image": common.maskImage = value; break;
      case "--filename-prefix": common.filenamePrefix = value; break;
      default: fail(`Unknown argument: ${flag}\nRun with --help for usage.`);
    }
  }

  if (!common.help && !common.promptFile) fail("--prompt-file is required.");
  validateCommonOptions(common);
  return { common, extras };
}

export function printCommonHelp(description: string, extra = ""): void {
  const defaults = loadConfig().generation;
  console.log(`${description}

Settings: ${getWorkspacePaths().configPath}
CLI arguments override project config; omitted config fields use config.json.example.

Required:
  --prompt-file <path>       Prompt markdown/text file; content after the first --- is sent.

Options:
  --model <id>               Default: ${defaults.model}
  --output-dir <path>        Default: ${getWorkspacePaths().outputDir}
  --n <1-10>                 Default: ${defaults.count}
  --size <WxH|auto>          OpenAI dimensions; Gemini derives square/portrait/landscape (default: ${defaults.size})
  --quality <level>          OpenAI quality passthrough: low | medium | high | auto (default: ${defaults.quality})
  --output-format <format>   png | jpeg | webp, or image/* (default: ${defaults.outputFormat})
  --compression <0-100>      JPEG/WebP compression only
  --reference-image <value>  Local path, file URL, HTTP(S) URL, or data URL; repeatable
  --mask-image <value>       Optional mask for edits
  --filename-prefix <slug>   Semantic object-name prefix; derived from prompt filename by default
  -h, --help                 Show this help
${extra}`);
}

function parseQuality(value: string): Quality {
  if (["low", "medium", "high", "auto"].includes(value)) return value as Quality;
  return fail(`Invalid --quality '${value}'. Use low, medium, high, or auto.`);
}

function parseOutputFormat(value: string): OutputFormat {
  const normalized = value.toLowerCase().replace(/^image\//, "");
  if (normalized === "jpg") return "jpeg";
  if (["png", "jpeg", "webp"].includes(normalized)) return normalized as OutputFormat;
  return fail(`Invalid --output-format '${value}'. Use png, jpeg, or webp.`);
}

function validateCommonOptions(options: CommonOptions): void {
  if (!Number.isInteger(options.n) || options.n < 1 || options.n > 10) {
    fail("--n must be an integer between 1 and 10.");
  }
  if (options.compression !== undefined &&
      (!Number.isInteger(options.compression) || options.compression < 0 || options.compression > 100)) {
    fail("--compression must be an integer between 0 and 100.");
  }
  if (options.compression !== undefined && options.outputFormat === "png") {
    fail("--compression is only supported with jpeg or webp output.");
  }
}

export function requireApiKey(): string {
  const apiKey = process.env[ZENMUX_API_KEY_ENV];
  if (!apiKey) {
    fail(`Environment variable ${ZENMUX_API_KEY_ENV} is not set.\nExport it first:\n  export ${ZENMUX_API_KEY_ENV}=...`);
  }
  return apiKey;
}

export async function loadPrompt(promptFile: string): Promise<string> {
  const text = await readFile(resolveUserPath(promptFile), "utf8");
  const parts = text.split(/^---\s*$/m, 2);
  const body = (parts.length === 2 ? parts[1] : parts[0])?.trim();
  if (!body) fail(`Prompt file '${promptFile}' is empty after stripping metadata.`);
  if (body.length > 32_000) fail("Prompt exceeds the GPT Image limit of 32,000 characters.");
  return body;
}

export function resolveUserPath(value: string): string {
  const raw = stripQuotes(value.trim());
  if (raw.startsWith("file://")) return fileURLToPath(raw);
  const expanded = raw === "~" ? homedir() : raw.startsWith("~/") ? path.join(homedir(), raw.slice(2)) : raw;
  return path.resolve(getInvocationDir(), expanded);
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))) return value.slice(1, -1);
  return value;
}

export async function loadReference(source: string): Promise<ReferenceImage> {
  const raw = stripQuotes(source.trim());
  if (/^data:image\//i.test(raw)) return referenceFromDataUrl(raw);
  if (/^https?:\/\//i.test(raw)) return referenceFromUrl(raw);

  const filename = resolveUserPath(raw);
  const data = await readFile(filename);
  assertReferenceSize(data, raw);
  return { source: raw, data, mimeType: mimeFromFilename(filename), filename: path.basename(filename) };
}

function referenceFromDataUrl(raw: string): ReferenceImage {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(raw);
  if (!match?.[1] || !match[2]) return fail("Reference data URL must be a base64-encoded image.");
  const data = Buffer.from(match[2], "base64");
  assertReferenceSize(data, "data URL");
  const mimeType = normalizeImageMime(match[1]);
  return { source: "data URL", data, mimeType, filename: `reference.${extensionFromMime(mimeType)}` };
}

async function referenceFromUrl(raw: string): Promise<ReferenceImage> {
  const response = await fetch(raw, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) fail(`Failed to download reference image (${response.status} ${response.statusText}): ${raw}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REFERENCE_BYTES) {
    fail(`Reference image exceeds 50 MB: ${raw}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  assertReferenceSize(data, raw);
  const urlPath = new URL(raw).pathname;
  const mimeType = normalizeImageMime(response.headers.get("content-type")?.split(";", 1)[0] ?? mimeFromFilename(urlPath));
  return { source: raw, data, mimeType, filename: path.basename(urlPath) || `reference.${extensionFromMime(mimeType)}` };
}

function assertReferenceSize(data: Buffer, source: string): void {
  if (data.length === 0) fail(`Reference image is empty: ${source}`);
  if (data.length > MAX_REFERENCE_BYTES) fail(`Reference image exceeds 50 MB: ${source}`);
}

export function normalizeImageMime(value: string): string {
  const mime = value.toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime.startsWith("image/") ? mime : "image/png";
}

export function mimeFromFilename(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".heic": return "image/heic";
    case ".heif": return "image/heif";
    case ".gif": return "image/gif";
    case ".bmp": return "image/bmp";
    default: return "image/png";
  }
}

export function mimeFromFormat(format: OutputFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export function extensionFromMime(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType.toLowerCase() === "image/jpeg") return "jpg";
  if (mimeType.toLowerCase() === "image/webp") return "webp";
  return "png";
}

export function detectOutputMime(data: Buffer, fallback: string): string {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return fallback;
}

export function slugifyObjectName(value: string, maxLength = 48): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength)
    .replace(/-$/g, "");
  return slug || "image";
}

export function createRunIdentity(): { timestamp: string; runId: string } {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").toLowerCase();
  return { timestamp, runId: randomBytes(4).toString("hex") };
}

export function deriveFilenamePrefix(promptFile: string, requested?: string): string {
  if (requested) return slugifyObjectName(requested);
  const base = path.basename(promptFile, path.extname(promptFile)).replace(/^\d{8}-\d{6}-/, "");
  return slugifyObjectName(base);
}

export function makeObjectFilename(params: {
  prefix: string;
  model: string;
  timestamp: string;
  runId: string;
  index: number;
  mimeType: string;
}): string {
  const prefix = slugifyObjectName(params.prefix);
  const model = slugifyObjectName(params.model, 56);
  const index = String(params.index).padStart(2, "0");
  return `${prefix}-${model}-${params.timestamp}-${params.runId}-${index}.${extensionFromMime(params.mimeType)}`;
}

export async function ensureOutputDir(value: string): Promise<string> {
  ensureWorkspace();
  const outputDir = resolveUserPath(value);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}

export async function saveImage(params: {
  data: Buffer;
  outputDir: string;
  prefix: string;
  model: string;
  timestamp: string;
  runId: string;
  index: number;
  fallbackMime: string;
}): Promise<string> {
  const mimeType = detectOutputMime(params.data, params.fallbackMime);
  const filename = makeObjectFilename({ ...params, mimeType });
  const outputPath = path.join(params.outputDir, filename);
  await writeFile(outputPath, params.data, { flag: "wx", mode: 0o600 });
  return outputPath;
}

export function printResult(paths: string[], outputDir: string, model: string): void {
  if (paths.length === 0) fail("No images were returned or saved.");
  const result = { ok: true, status: "success", model, count: paths.length, output_dir: outputDir, image_paths: paths };
  console.log(`\nSUCCESS: generated and saved ${paths.length} image(s).`);
  console.log(`OUTPUT_DIR: ${outputDir}`);
  console.log("IMAGE_PATHS:");
  for (const imagePath of paths) console.log(`  ${imagePath}`);
  console.log(`RESULT_JSON: ${JSON.stringify(result)}`);
}

export function isOpenAIImageModel(model: string): boolean {
  return /^(?:openai\/)?gpt-image-/i.test(model) || model === "chatgpt-image-latest" || model === "openai/chatgpt-image-latest";
}

export function openAIModelName(model: string): string {
  return model.replace(/^openai\//i, "");
}

export function isGptImage2(model: string): boolean {
  return /^(?:openai\/)?gpt-image-2(?:-|$)/i.test(model);
}

export function validateSize(model: string, size: string, openAIProtocol: boolean): void {
  if (size === "auto") return;
  if (!isGptImage2(model)) {
    if (openAIProtocol && !PRESET_SIZES.has(size)) fail(`Model '${model}' supports only ${[...PRESET_SIZES].join(", ")} in this helper.`);
    return;
  }
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match?.[1] || !match[2]) fail(`Invalid --size '${size}'. Expected WIDTHxHEIGHT or auto.`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const ratio = width / height;
  const errors: string[] = [];
  if (width % 16 !== 0 || height % 16 !== 0) errors.push("each edge must be divisible by 16");
  if (ratio < 1 / 3 || ratio > 3) errors.push("aspect ratio must be between 1:3 and 3:1");
  if (pixels < GPT_IMAGE_2_MIN_PIXELS || pixels > GPT_IMAGE_2_MAX_PIXELS) {
    errors.push(`pixel count must be ${GPT_IMAGE_2_MIN_PIXELS.toLocaleString()}-${GPT_IMAGE_2_MAX_PIXELS.toLocaleString()}`);
  }
  if (errors.length > 0) fail(`Invalid --size '${size}' for gpt-image-2: ${errors.join("; ")}.`);
}

export async function downloadOutput(url: string): Promise<{ data: Buffer; mimeType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) fail(`Failed to download generated image (${response.status}): ${url}`);
  return {
    data: Buffer.from(await response.arrayBuffer()),
    mimeType: normalizeImageMime(response.headers.get("content-type")?.split(";", 1)[0] ?? "image/png"),
  };
}

export async function runMain(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}
