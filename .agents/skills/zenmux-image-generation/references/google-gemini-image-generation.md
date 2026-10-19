# Google Gemini native image generation protocol

Last verified: 2026-08-31 against the Google AI for Developers page updated
2026-08-26.

Primary sources:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/interactions-overview
- https://googleapis.github.io/js-genai/

## Current Google-native API

Google's current direct Gemini API examples use the Interactions API and the
`@google/genai` TypeScript SDK:

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const interaction = await ai.interactions.create({
  model: "gemini-3.1-flash-image",
  input: "Create a clean product illustration of a nano banana.",
  response_format: {
    type: "image",
    mime_type: "image/png",
    aspect_ratio: "1:1",
    image_size: "1K",
  },
});

const image = interaction.output_image;
if (!image?.data) throw new Error("No image returned");
await fs.promises.writeFile("output.png", Buffer.from(image.data, "base64"));
```

Important current fields:

- `interaction.output_image`: convenience accessor for the last output image.
- `previous_interaction_id`: continues a multi-turn image edit.
- `response_format`: selects `mime_type`, `aspect_ratio`, and `image_size`.
- `input`: accepts text or ordered text/image content blocks with base64 image
  data and `mime_type`.
- `tools: [{ type: "google_search" }]`: grounds supported Gemini image models
  with current information. Gemini 3.1 Flash Image also supports Google Image
  Search grounding; Flash Lite does not support search grounding.

For interleaved text and multiple images, iterate through `interaction.steps`;
`output_image` only exposes the last image block.

## Current model guidance

- `gemini-3.1-flash-image` (Nano Banana 2): general-purpose default, supports
  0.5K/1K/2K/4K, strong multi-reference consistency and text rendering.
- `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite): fastest and cheapest,
  1K only, not intended for complex multi-reference or sequential editing.
- `gemini-3-pro-image` (Nano Banana Pro): premium complex asset production,
  grounding and precision control, up to 4K.
- `gemini-2.5-flash-image`: legacy; Google recommends migrating to Nano Banana
  2 Lite.

Gemini 3 image models accept up to 14 reference images, with model-specific
high-fidelity object, character, and style-reference sub-limits. All generated
images include SynthID.

## ZenMux compatibility boundary

Do not assume that Google's direct `/v1beta/interactions` route is exposed by
ZenMux. As of the verification date, ZenMux documents its Google Gemini
protocol as follows:

- `google/gemini-*-image` models: `client.models.generateContent` or
  `generateContentStream`, with `responseModalities: ["TEXT", "IMAGE"]`.
- Other ZenMux image models: `client.models.generateImages` for text-to-image
  and `client.models.editImage` for reference-image editing.
- Client configuration: `vertexai: true`, `apiVersion: "v1"`, and
  `baseUrl: "https://zenmux.ai/api/vertex-ai"`.

The ZenMux helper must follow the documented ZenMux surface until ZenMux adds
Interactions API support to its public docs/model endpoint. Keep the Google
Interactions notes here so future updates can migrate deliberately rather than
silently sending an unsupported request shape.

`@google/genai` 2.19 emits a deprecation warning for `generateImages` and says
the method will be removed in the next major SDK release, no earlier than
2027-01-01. This does not mean ZenMux's documented Vertex `:predict` endpoint
has stopped working: paid smoke tests on 2026-08-31 succeeded for GPT Image 2,
Qwen Image 3.0 Pro, Seedream 5.0 Pro, and Kling v3. Keep the SDK method only as
a compatibility bridge, pin the current major version, and re-check ZenMux's
public docs before adopting the next `@google/genai` major.

## ZenMux TypeScript option mapping

For Google Gemini models through ZenMux `generateContent`:

```ts
const response = await client.models.generateContent({
  model: "google/gemini-3.1-flash-image",
  contents: [prompt, ...imageParts],
  config: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
  },
});
```

For non-Google models through ZenMux `generateImages`:

- Standard config fields: `numberOfImages`, `negativePrompt`, `aspectRatio`,
  `outputMimeType`, `outputCompressionQuality`, `seed`, `enhancePrompt`,
  `personGeneration`, `safetyFilterLevel`, `includeRaiReason`, `addWatermark`,
  and `guidanceScale` where the selected provider supports them.
- OpenAI passthrough fields go in
  `config.httpOptions.extraBody.{imageSize,quality}`.
- Non-OpenAI resolution tiers go in
  `config.httpOptions.extraBody.sampleImageSize` where supported.
- `background` transparency is not mapped by ZenMux's Vertex AI protocol;
  use the OpenAI Images protocol for GPT Image transparent PNG/WebP output.
