#!/usr/bin/env -S npx tsx
import OpenAI, { toFile } from "openai";
import type { Images } from "openai/resources/images";

import {
  ZENMUX_OPENAI_BASE_URL,
  createRunIdentity,
  deriveFilenamePrefix,
  downloadOutput,
  ensureOutputDir,
  extensionFromMime,
  isGptImage2,
  isOpenAIImageModel,
  loadPrompt,
  loadReference,
  mimeFromFormat,
  openAIModelName,
  parseArgs,
  printCommonHelp,
  printResult,
  requireApiKey,
  runMain,
  saveImage,
  validateSize,
  type OutputFormat,
  type ReferenceImage,
} from "./image-common.js";

const DESCRIPTION = "Generate or edit images through ZenMux's OpenAI Images API.";

function optionalString(extras: Map<string, string | boolean>, name: string): string | undefined {
  const value = extras.get(name);
  return typeof value === "string" ? value : undefined;
}

function validateOpenAIOptions(params: {
  model: string;
  references: string[];
  mask?: string;
  background?: string;
  outputFormat: OutputFormat;
}): void {
  if (!isOpenAIImageModel(params.model)) {
    throw new Error(`'${params.model}' is not an OpenAI GPT Image model. Use generate-gemini.ts for this model.`);
  }
  if (params.references.length > 16) throw new Error("GPT Image edits accept at most 16 reference images.");
  if (params.mask && params.references.length === 0) throw new Error("--mask-image requires at least one --reference-image.");
  if (params.background === "transparent" && params.outputFormat === "jpeg") {
    throw new Error("Transparent backgrounds require png or webp output.");
  }
  if (params.background && !["transparent", "opaque", "auto"].includes(params.background)) {
    throw new Error("--background must be transparent, opaque, or auto.");
  }
}

async function asUpload(reference: ReferenceImage, index: number, prefix = "image") {
  return toFile(reference.data, `${prefix}-${index}.${extensionFromMime(reference.mimeType)}`, {
    type: reference.mimeType,
  });
}

async function saveResponse(params: {
  response: Images.ImagesResponse;
  outputDir: string;
  prefix: string;
  model: string;
  timestamp: string;
  runId: string;
  outputFormat: OutputFormat;
}): Promise<string[]> {
  const saved: string[] = [];
  const fallbackMime = mimeFromFormat(params.outputFormat);
  for (const [zeroIndex, item] of (params.response.data ?? []).entries()) {
    let data: Buffer;
    let itemMime = fallbackMime;
    if (item.b64_json) {
      data = Buffer.from(item.b64_json, "base64");
    } else if (item.url) {
      const downloaded = await downloadOutput(item.url);
      data = downloaded.data;
      itemMime = downloaded.mimeType;
    } else {
      throw new Error(`Image result ${zeroIndex + 1} has neither b64_json nor url.`);
    }
    saved.push(await saveImage({
      data,
      outputDir: params.outputDir,
      prefix: params.prefix,
      model: params.model,
      timestamp: params.timestamp,
      runId: params.runId,
      index: zeroIndex + 1,
      fallbackMime: itemMime,
    }));
  }
  return saved;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), {
    description: DESCRIPTION,
    extraValue: new Set(["--background", "--input-fidelity", "--moderation", "--user"]),
  });
  if (parsed.common.help) {
    printCommonHelp(DESCRIPTION, `OpenAI-only:
  --background <value>      transparent | opaque | auto
  --input-fidelity <value>  high | low (edits only)
  --moderation <value>      low | auto (generation only)
  --user <id>               Stable end-user identifier for abuse monitoring`);
    return;
  }

  const { common } = parsed;
  const background = optionalString(parsed.extras, "--background");
  const inputFidelity = optionalString(parsed.extras, "--input-fidelity");
  const moderation = optionalString(parsed.extras, "--moderation");
  const user = optionalString(parsed.extras, "--user");
  if (inputFidelity && !["high", "low"].includes(inputFidelity)) {
    throw new Error("--input-fidelity must be high or low.");
  }
  if (inputFidelity && isGptImage2(common.model)) {
    throw new Error("gpt-image-2 always processes image inputs at high fidelity; omit --input-fidelity.");
  }
  if (moderation && !["low", "auto"].includes(moderation)) {
    throw new Error("--moderation must be low or auto.");
  }
  validateOpenAIOptions({
    model: common.model,
    references: common.referenceImages,
    ...(common.maskImage ? { mask: common.maskImage } : {}),
    ...(background ? { background } : {}),
    outputFormat: common.outputFormat,
  });
  validateSize(common.model, common.size, true);

  const apiKey = requireApiKey();
  const prompt = await loadPrompt(common.promptFile);
  const outputDir = await ensureOutputDir(common.outputDir);
  const references = await Promise.all(common.referenceImages.map(loadReference));
  for (const reference of references) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType)) {
      throw new Error(`OpenAI image edits require PNG, JPEG, or WebP input; convert '${reference.source}' first.`);
    }
  }
  const mask = common.maskImage ? await loadReference(common.maskImage) : undefined;
  if (mask && (mask.mimeType !== "image/png" || mask.data.length > 4 * 1024 * 1024)) {
    throw new Error("OpenAI masks must be PNG files smaller than 4 MB and match the first input image dimensions.");
  }

  const client = new OpenAI({ apiKey, baseURL: ZENMUX_OPENAI_BASE_URL, timeout: 10 * 60_000, maxRetries: 2 });
  const model = openAIModelName(common.model);
  const outputFormat = common.outputFormat;
  let response: Images.ImagesResponse;

  if (references.length > 0) {
    if (moderation) throw new Error("--moderation is only valid for image generation, not edits.");
    const uploads = await Promise.all(references.map((reference, index) => asUpload(reference, index + 1)));
    const params: Images.ImageEditParamsNonStreaming = {
      model,
      prompt,
      image: uploads.length === 1 ? uploads[0]! : uploads,
      n: common.n,
      size: common.size,
      quality: common.quality,
      output_format: outputFormat,
      ...(common.compression !== undefined ? { output_compression: common.compression } : {}),
      ...(background ? { background: background as "transparent" | "opaque" | "auto" } : {}),
      ...(inputFidelity ? { input_fidelity: inputFidelity as "high" | "low" } : {}),
      ...(user ? { user } : {}),
      ...(mask ? { mask: await asUpload(mask, 1, "mask") } : {}),
    };
    response = await client.images.edit(params);
  } else {
    if (inputFidelity) throw new Error("--input-fidelity requires at least one reference image.");
    const params: Images.ImageGenerateParamsNonStreaming = {
      model,
      prompt,
      n: common.n,
      size: common.size,
      quality: common.quality,
      output_format: outputFormat,
      ...(common.compression !== undefined ? { output_compression: common.compression } : {}),
      ...(background ? { background: background as "transparent" | "opaque" | "auto" } : {}),
      ...(moderation ? { moderation: moderation as "low" | "auto" } : {}),
      ...(user ? { user } : {}),
    };
    response = await client.images.generate(params);
  }

  const { timestamp, runId } = createRunIdentity();
  const prefix = deriveFilenamePrefix(common.promptFile, common.filenamePrefix);
  const saved = await saveResponse({ response, outputDir, prefix, model: common.model, timestamp, runId, outputFormat });
  printResult(saved, outputDir, common.model);
}

await runMain(main);
