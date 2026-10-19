#!/usr/bin/env -S npx tsx
import {
  GoogleGenAI,
  MaskReferenceImage,
  MaskReferenceMode,
  Modality,
  RawReferenceImage,
  createPartFromBase64,
  createPartFromText,
  type EditImageConfig,
  type GenerateContentConfig,
  type GenerateImagesConfig,
  type GeneratedImage,
  type Part,
  type ReferenceImage as GenAIReferenceImage,
} from "@google/genai";

import {
  ZENMUX_GEMINI_BASE_URL,
  createRunIdentity,
  deriveFilenamePrefix,
  downloadOutput,
  ensureOutputDir,
  isOpenAIImageModel,
  loadPrompt,
  loadReference,
  mimeFromFormat,
  parseArgs,
  printCommonHelp,
  printResult,
  requireApiKey,
  runMain,
  saveImage,
  validateSize,
  type CommonOptions,
  type ReferenceImage,
} from "./image-common.js";

const DESCRIPTION = "Generate or edit images through ZenMux's Gemini / Vertex AI-compatible API.";
const GEMINI_EXTRA_VALUES = new Set([
  "--aspect-ratio",
  "--image-size",
  "--negative-prompt",
  "--seed",
  "--person-generation",
  "--safety-filter-level",
  "--guidance-scale",
]);
const GEMINI_BOOLEAN_FLAGS = new Set([
  "--enhance-prompt",
  "--include-rai-reason",
  "--add-watermark",
  "--stream",
]);

interface ProtocolOptions {
  aspectRatio?: string;
  imageSize?: string;
  negativePrompt?: string;
  seed?: number;
  personGeneration?: string;
  safetyFilterLevel?: string;
  guidanceScale?: number;
  enhancePrompt: boolean;
  includeRaiReason: boolean;
  addWatermark: boolean;
  stream: boolean;
}

function isGeminiContentModel(model: string): boolean {
  return /^google\/gemini-.*image/i.test(model);
}

function optionalString(extras: Map<string, string | boolean>, name: string): string | undefined {
  const value = extras.get(name);
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(extras: Map<string, string | boolean>, name: string): number | undefined {
  const raw = optionalString(extras, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

function parseProtocolOptions(extras: Map<string, string | boolean>): ProtocolOptions {
  const aspectRatio = optionalString(extras, "--aspect-ratio");
  const rawImageSize = optionalString(extras, "--image-size");
  const imageSize = rawImageSize?.toUpperCase();
  const seed = optionalNumber(extras, "--seed");
  const guidanceScale = optionalNumber(extras, "--guidance-scale");
  if (aspectRatio && !/^\d+:\d+$/.test(aspectRatio)) {
    throw new Error("--aspect-ratio must look like 1:1, 16:9, or 9:16.");
  }
  if (imageSize && !["0.5K", "1K", "2K", "4K"].includes(imageSize)) {
    throw new Error("--image-size must be 0.5K, 1K, 2K, or 4K.");
  }
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0)) {
    throw new Error("--seed must be a non-negative integer.");
  }
  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(imageSize ? { imageSize } : {}),
    ...(optionalString(extras, "--negative-prompt") ? { negativePrompt: optionalString(extras, "--negative-prompt")! } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(optionalString(extras, "--person-generation") ? { personGeneration: optionalString(extras, "--person-generation")! } : {}),
    ...(optionalString(extras, "--safety-filter-level") ? { safetyFilterLevel: optionalString(extras, "--safety-filter-level")! } : {}),
    ...(guidanceScale !== undefined ? { guidanceScale } : {}),
    enhancePrompt: extras.get("--enhance-prompt") === true,
    includeRaiReason: extras.get("--include-rai-reason") === true,
    addWatermark: extras.get("--add-watermark") === true,
    stream: extras.get("--stream") === true,
  };
}

function derivedGeminiImageConfig(size: string, options: ProtocolOptions): GenerateContentConfig["imageConfig"] {
  if (options.aspectRatio || options.imageSize) {
    return {
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      ...(options.imageSize ? { imageSize: options.imageSize } : {}),
    };
  }
  switch (size) {
    case "1024x1536": return { aspectRatio: "2:3", imageSize: "1K" };
    case "1536x1024": return { aspectRatio: "3:2", imageSize: "1K" };
    case "1024x1024": return { aspectRatio: "1:1", imageSize: "1K" };
    case "auto": return undefined;
    default: return undefined;
  }
}

function toRawReference(reference: ReferenceImage, id: number): RawReferenceImage {
  const result = new RawReferenceImage();
  result.referenceId = id;
  result.referenceImage = { imageBytes: reference.data.toString("base64"), mimeType: reference.mimeType };
  return result;
}

function toMaskReference(reference: ReferenceImage, id: number): MaskReferenceImage {
  const result = new MaskReferenceImage();
  result.referenceId = id;
  result.referenceImage = { imageBytes: reference.data.toString("base64"), mimeType: reference.mimeType };
  result.config = { maskMode: MaskReferenceMode.MASK_MODE_USER_PROVIDED };
  return result;
}

async function saveGeneratedItems(params: {
  items: GeneratedImage[];
  common: CommonOptions;
  outputDir: string;
  prefix: string;
  timestamp: string;
  runId: string;
}): Promise<string[]> {
  const saved: string[] = [];
  for (const [zeroIndex, item] of params.items.entries()) {
    const image = item.image;
    if (!image) continue;
    let data: Buffer;
    let mimeType = image.mimeType ?? mimeFromFormat(params.common.outputFormat);
    if (image.imageBytes) {
      data = Buffer.from(image.imageBytes, "base64");
    } else if (image.gcsUri?.startsWith("http")) {
      const downloaded = await downloadOutput(image.gcsUri);
      data = downloaded.data;
      mimeType = downloaded.mimeType;
    } else {
      throw new Error(`Generated image ${zeroIndex + 1} contains no downloadable bytes or HTTP URL.`);
    }
    saved.push(await saveImage({
      data,
      outputDir: params.outputDir,
      prefix: params.prefix,
      model: params.common.model,
      timestamp: params.timestamp,
      runId: params.runId,
      index: zeroIndex + 1,
      fallbackMime: mimeType,
    }));
  }
  return saved;
}

function lastOutputParts(chunks: Part[][]): Part[] {
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    if (chunks[index]?.some((part) => part.inlineData?.data)) return chunks[index]!;
  }
  return chunks.at(-1) ?? [];
}

async function generateGeminiContent(params: {
  client: GoogleGenAI;
  common: CommonOptions;
  protocol: ProtocolOptions;
  prompt: string;
  references: ReferenceImage[];
  outputDir: string;
  prefix: string;
  timestamp: string;
  runId: string;
}): Promise<string[]> {
  if (params.common.compression !== undefined) {
    throw new Error("ZenMux Gemini generateContent does not expose output compression; omit --compression.");
  }
  if (params.references.length > 14) throw new Error("Gemini 3 image models accept at most 14 reference images.");
  if (params.protocol.negativePrompt || params.protocol.seed !== undefined || params.protocol.enhancePrompt ||
      params.protocol.personGeneration || params.protocol.safetyFilterLevel || params.protocol.includeRaiReason ||
      params.protocol.addWatermark || params.protocol.guidanceScale !== undefined) {
    throw new Error("This option set belongs to generateImages providers and is not supported by Gemini generateContent.");
  }

  const saved: string[] = [];
  for (let index = 1; index <= params.common.n; index += 1) {
    const contents: Part[] = [createPartFromText(params.prompt)];
    for (const reference of params.references) {
      contents.push(createPartFromBase64(reference.data.toString("base64"), reference.mimeType));
    }
    const derivedImageConfig = derivedGeminiImageConfig(params.common.size, params.protocol);
    const imageConfig = {
      ...(derivedImageConfig ?? {}),
      outputMimeType: mimeFromFormat(params.common.outputFormat),
    };
    const config: GenerateContentConfig = {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig,
    };
    let parts: Part[];
    if (params.protocol.stream) {
      const stream = await params.client.models.generateContentStream({ model: params.common.model, contents, config });
      const chunks: Part[][] = [];
      for await (const chunk of stream) chunks.push(chunk.candidates?.[0]?.content?.parts ?? []);
      parts = lastOutputParts(chunks);
    } else {
      const response = await params.client.models.generateContent({ model: params.common.model, contents, config });
      parts = response.candidates?.[0]?.content?.parts ?? [];
    }
    const text = parts.map((part) => part.text).filter(Boolean).join(" ").trim();
    if (text) console.log(`[${index}/${params.common.n}] model said: ${text}`);
    const imagePart = [...parts].reverse().find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      console.warn(`[${index}/${params.common.n}] WARNING: no image returned.`);
      continue;
    }
    saved.push(await saveImage({
      data: Buffer.from(imagePart.inlineData.data, "base64"),
      outputDir: params.outputDir,
      prefix: params.prefix,
      model: params.common.model,
      timestamp: params.timestamp,
      runId: params.runId,
      index,
      fallbackMime: imagePart.inlineData.mimeType ?? "image/png",
    }));
  }
  return saved;
}

function vertexConfig(params: {
  common: CommonOptions;
  protocol: ProtocolOptions;
  editing: boolean;
}): GenerateImagesConfig | EditImageConfig {
  const extraBody: Record<string, unknown> = {};
  if (isOpenAIImageModel(params.common.model)) {
    extraBody.imageSize = params.common.size;
    extraBody.quality = params.common.quality;
  } else if (params.protocol.imageSize) {
    extraBody.sampleImageSize = params.protocol.imageSize;
  }
  if (params.editing && params.protocol.enhancePrompt) extraBody.enhancePrompt = true;

  const shared = {
    numberOfImages: params.common.n,
    outputMimeType: mimeFromFormat(params.common.outputFormat),
    ...(params.common.compression !== undefined ? { outputCompressionQuality: params.common.compression } : {}),
    ...(params.protocol.negativePrompt ? { negativePrompt: params.protocol.negativePrompt } : {}),
    ...(params.protocol.aspectRatio ? { aspectRatio: params.protocol.aspectRatio } : {}),
    ...(params.protocol.seed !== undefined ? { seed: params.protocol.seed } : {}),
    ...(params.protocol.personGeneration ? { personGeneration: params.protocol.personGeneration as never } : {}),
    ...(params.protocol.safetyFilterLevel ? { safetyFilterLevel: params.protocol.safetyFilterLevel as never } : {}),
    ...(params.protocol.includeRaiReason ? { includeRaiReason: true } : {}),
    ...(params.protocol.addWatermark ? { addWatermark: true } : {}),
    ...(params.protocol.guidanceScale !== undefined ? { guidanceScale: params.protocol.guidanceScale } : {}),
    ...(Object.keys(extraBody).length > 0 ? { httpOptions: { extraBody } } : {}),
  };
  return params.editing
    ? shared satisfies EditImageConfig
    : { ...shared, ...(params.protocol.enhancePrompt ? { enhancePrompt: true } : {}) } satisfies GenerateImagesConfig;
}

async function generateVertexImages(params: {
  client: GoogleGenAI;
  common: CommonOptions;
  protocol: ProtocolOptions;
  prompt: string;
  references: ReferenceImage[];
  mask?: ReferenceImage;
  outputDir: string;
  prefix: string;
  timestamp: string;
  runId: string;
}): Promise<string[]> {
  if (params.protocol.stream) throw new Error("generateImages/editImage do not support --stream; only Gemini generateContent does.");
  let items: GeneratedImage[];
  if (params.references.length > 0) {
    const referenceImages: GenAIReferenceImage[] = params.references.map((reference, index) =>
      toRawReference(reference, index + 1));
    if (params.mask) referenceImages.push(toMaskReference(params.mask, referenceImages.length + 1));
    const response = await params.client.models.editImage({
      model: params.common.model,
      prompt: params.prompt,
      referenceImages,
      config: vertexConfig({ common: params.common, protocol: params.protocol, editing: true }),
    });
    items = response.generatedImages ?? [];
  } else {
    const response = await params.client.models.generateImages({
      model: params.common.model,
      prompt: params.prompt,
      config: vertexConfig({ common: params.common, protocol: params.protocol, editing: false }),
    });
    items = response.generatedImages ?? [];
  }
  return saveGeneratedItems({ ...params, items });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), {
    description: DESCRIPTION,
    extraValue: GEMINI_EXTRA_VALUES,
    extraBoolean: GEMINI_BOOLEAN_FLAGS,
  });
  if (parsed.common.help) {
    printCommonHelp(DESCRIPTION, `Gemini/Vertex options:
  --aspect-ratio <ratio>       e.g. 1:1, 16:9, 9:16
  --image-size <tier>          0.5K | 1K | 2K | 4K
  --negative-prompt <text>     Supported by selected generateImages providers
  --seed <integer>             Reproducible generation where supported
  --enhance-prompt             Provider-side prompt enhancement where supported
  --person-generation <value>  Google Imagen only
  --safety-filter-level <value> Google Imagen only
  --include-rai-reason         Google Imagen only
  --add-watermark              Supported providers only
  --guidance-scale <number>    Flux only
  --stream                     Gemini generateContent only

Protocol behavior:
  google/gemini-*-image* uses generateContent; all other models use generateImages/editImage.
  --size/--quality are OpenAI passthrough fields; use --aspect-ratio/--image-size elsewhere.`);
    return;
  }
  const { common } = parsed;
  const protocol = parseProtocolOptions(parsed.extras);
  const geminiContent = isGeminiContentModel(common.model);
  if (common.maskImage && common.referenceImages.length === 0) throw new Error("--mask-image requires at least one --reference-image.");
  if (common.maskImage && geminiContent) throw new Error("Binary masks are not supported by Gemini generateContent; describe the edit semantically.");
  validateSize(common.model, common.size, false);

  const apiKey = requireApiKey();
  const prompt = await loadPrompt(common.promptFile);
  const outputDir = await ensureOutputDir(common.outputDir);
  const references = await Promise.all(common.referenceImages.map(loadReference));
  const mask = common.maskImage ? await loadReference(common.maskImage) : undefined;
  const client = new GoogleGenAI({
    apiKey,
    vertexai: true,
    httpOptions: { apiVersion: "v1", baseUrl: ZENMUX_GEMINI_BASE_URL, timeout: 10 * 60_000 },
  });
  const { timestamp, runId } = createRunIdentity();
  const prefix = deriveFilenamePrefix(common.promptFile, common.filenamePrefix);
  const base = { client, common, protocol, prompt, references, outputDir, prefix, timestamp, runId };
  const saved = geminiContent
    ? await generateGeminiContent(base)
    : await generateVertexImages({ ...base, ...(mask ? { mask } : {}) });
  printResult(saved, outputDir, common.model);
}

await runMain(main);
