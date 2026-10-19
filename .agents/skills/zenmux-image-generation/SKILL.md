---
name: zenmux-image-generation
description: >-
  Generate or edit images through ZenMux with OpenAI GPT Image, Nano Banana,
  Qwen Image, Seedream, FLUX, Kling, GLM, HY-Image, Agnes, and future image
  models. Use whenever the user asks to create, draw, render, design, remix,
  retouch, inpaint, or transform an image; make a photo, portrait, logo,
  product shot, poster, infographic, comic, ad, UI mockup, packaging concept,
  diagram, or visual asset; or says 生成图片, 画一张, 出图, AI 画图, 文生图,
  图生图, 设计海报, 做 logo, 改图, P 图, 图片编辑, 帮我画, or 用 ZenMux 生图.
  In a ZenMux project, prefer this skill for image output even when the user
  does not name a model or API protocol.
---

# zenmux-image-generation

Turn the user's visual intent into an optimized prompt, confirm the prompt and
parameters, then generate or edit images through ZenMux and report the saved
files.

Load the current project's config before choosing a model, optimizing a prompt,
or refreshing sources. The bundled `config.json.example` contains portable
factory defaults; user preferences live only in the project's runtime directory.

All runtime files belong to the current project under
`.context/zenmux-image-generation/`:

```text
.context/zenmux-image-generation/
  .gitignore    # Ignores generated files; allows .gitignore and config.json in Git
  config.json   # User settings, copied from config.json.example only if absent
  refresh-state.json # Per-resource refresh attempts and successful updates
  output/       # Generated images
  prompts/      # Optimized prompts and generation parameters
  assets/       # Reference images copied/downloaded for this task, if needed
  references/   # Refreshed documentation, cookbooks, and model cache
```

The helpers resolve the Git root from the original invocation directory
(`INIT_CWD` for `npm --prefix`); outside Git they use that invocation directory.
Run commands from the user's project. The skill may be installed elsewhere;
substitute its absolute path in script and `--prefix` arguments when needed.
Existing user reference images can stay in place. Skill code, locked dependencies,
and bundled offline references stay in the skill directory.

Initialize the workspace before writing any prompts or downloading assets:

```bash
node skills/zenmux-image-generation/scripts/workspace.mjs
```

This prints the absolute runtime directory, creates its subdirectories and
`.gitignore`, and copies `config.json.example` to `config.json` only if missing.
Existing user settings and ignore rules are preserved. Both reference refresh
and generation also initialize it automatically. Resolve prompt/cache paths from
this printed root when invoking from a project subdirectory.

`config.json` can be committed with the project. Generated images, prompt files,
reference caches, and `refresh-state.json` remain ignored.

## Configuration and prompt modes

Read effective settings (missing fields inherit the example without rewriting
user settings):

```bash
node skills/zenmux-image-generation/scripts/workspace.mjs --config
```

| Setting | Factory default | Meaning |
|---|---|---|
| `generation.model` | `openai/gpt-image-2.5-flare` | Default model |
| `generation.count` | `4` | Output count, 1–10 |
| `generation.size` | `1024x1024` | Size; model-specific validation still applies |
| `generation.quality` | `medium` | `low`, `medium`, `high`, or `auto` |
| `generation.outputFormat` | `png` | `png`, `jpeg`, or `webp` |
| `prompt.mode` | `direct` | `direct` or `reference`, described in step 5 |
| `refresh.autoUpdate` | `true` | Allow automatic network refreshes |
| `refresh.referencesIntervalHours` | `168` | Documentation/cookbooks: once per 7 days |
| `refresh.modelsIntervalHours` | `24` | Model catalogs: once per day |
| `refresh.retryIntervalMinutes` | `60` | Wait before retrying a failed refresh when a local copy exists |

Precedence: explicit user request/CLI flags > project config > example defaults.
Apply one-off requests for a model or prompt mode to this invocation; edit the
project config only when the user wants to change their saved preferences. Never
write user preferences into the shared example or skill source. Keep API keys in
`ZENMUX_API_KEY`, outside config. Malformed or invalid config reports its path and
fails without overwriting the file; fix it instead of silently using defaults.

Set `refresh.autoUpdate` to `false` to use local/bundled sources without automatic
network requests. Intervals accept non-negative numbers; `0` means refresh on
every invocation (failed requests still obey the retry delay). `--force` bypasses
both intervals and `autoUpdate` for an explicitly requested refresh.

## 1. Prepare the runtime and refresh sources

Require Node.js 22 or newer; reference commands also need `curl` and `jq`.
Install locked dependencies once per clone or after dependency changes:

```bash
npm ci --prefix skills/zenmux-image-generation
```

Generation requires `ZENMUX_API_KEY`. Never accept the key as a CLI argument
or print it:

```bash
export ZENMUX_API_KEY=...
```

At the beginning of an invocation, run the refresh check. It downloads only
resources whose interval has elapsed, or runs once if there is no refresh history.
Fresh caches are reused without network requests. In `direct` mode, prompt
cookbooks are neither copied nor downloaded; API documentation can still refresh:

```bash
bash skills/zenmux-image-generation/scripts/refresh_references.sh --quiet
# Only when the user requests an immediate update:
bash skills/zenmux-image-generation/scripts/refresh_references.sh --force
# One-off prompt-mode override, without editing config:
bash skills/zenmux-image-generation/scripts/refresh_references.sh --prompt-mode reference --quiet
```

Each successfully downloaded reference has its own timestamp in
`refresh-state.json`; unchanged files are skipped even if a different file failed.
Failed attempts keep the previous local copy and delay retries. A partial model
catalog refresh is not marked fully successful.

If the user named a model, preserve it. Otherwise, list current image models
unless the simple default clearly applies:

```bash
bash skills/zenmux-image-generation/scripts/list_models.sh
# Machine-readable alternatives:
bash skills/zenmux-image-generation/scripts/list_models.sh --names-only
bash skills/zenmux-image-generation/scripts/list_models.sh --json
```

The model command uses the same configured cache interval. When due, it merges
image models from both `https://zenmux.ai/api/v1/models`
and `https://zenmux.ai/api/vertex-ai/v1beta/models`, deduplicates exact IDs, and
updates the project-local cache. The two catalogs may expose different models.
On partial failure it retains additional cached models with a warning. Offline,
it falls back to the project cache, then the bundled
`references/zenmux-image-models.json`. `--snapshot` returns full normalized model
records, including output modalities. Use `list_models.sh --force` for an explicitly
requested live lookup or a model-unavailable error. Never invent a model ID from
memory.

Read the refreshed files in `.context/zenmux-image-generation/references/` first;
use same-named bundled `references/` files when no cached copy is available.
Reference paths below are relative to that selected directory.

Use sources in this order:

1. `references/zenmux-openai-image-generation.md` for ZenMux OpenAI Images
   protocol and TypeScript examples.
2. `references/zenmux-create-image-edit.md` for edit fields, masks, limits, and
   request shapes.
3. `references/openai-typescript-images-generate.md` or
   `references/openai-typescript-images-edit.md` for the current OpenAI SDK
   signature.
4. `references/zenmux-image-generation.md` for the Gemini/Vertex-compatible
   protocol.
5. `references/zenmux-generate-images.md` for the complete Vertex AI
   `generateImages` / `editImage` parameter map.
6. `references/google-gemini-image-generation.md` for Google's latest native
   Interactions API and the explicit ZenMux compatibility boundary.
7. In `reference` mode only, the `awesome-*` files for prompt inspiration, never API truth.

## 2. Resolve intent

Extract the following. Ask only for missing information that materially changes
the result, with at most three focused questions.

| Field | Default |
|---|---|
| Subject and desired change | Required |
| Style, composition, lighting, mood | Infer from the request |
| Reference images | None |
| Model | `generation.model` |
| Size | `generation.size` |
| Quality | `generation.quality` |
| Count | `generation.count` |
| Output format | `generation.outputFormat` |
| Exact text in image | None |
| Semantic filename prefix | Short English kebab-case summary |

Aspect shortcuts:

- Portrait, 竖版, phone wallpaper, story: `1024x1536`
- Landscape, 横版, banner, widescreen: `1536x1024`
- Square, 方形, logo, icon, social post: `1024x1024`
- 4K for `gpt-image-2`: `3840x2160`
- 2K/QHD for `gpt-image-2`: `2560x1440`

Capture every reference path or URL in user-supplied order. Accept local paths,
`file://`, `http(s)://`, and base64 image data URLs. Number references as
`[Image #1]`, `[Image #2]`, and so on in both prompt metadata and prompt text.
The flag order must match this numbering.

## 3. Choose the current model and protocol

The live model catalog is authoritative. The bundled snapshot was refreshed on
2026-09-12 from both endpoints. Useful choices include:

| Need | Suggested model |
|---|---|
| Default | `generation.model` from project config |
| Earlier OpenAI alternative | `openai/gpt-image-1.5` |
| Other new catalog entries | `openai/gpt-image-2.5-sunburst`, `meta/muse-image-1.0`, `x-ai/grok-imagine-image-2.0` |
| General Nano Banana default | `google/gemini-3.1-flash-image` |
| Lowest-latency Nano Banana | `google/gemini-3.1-flash-lite-image` |
| Complex professional assets | `google/gemini-3-pro-image` |
| Chinese poster/product design | `qwen/qwen-image-3.0-pro`, `bytedance/doubao-seedream-5.0-pro` |
| Photoreal or flexible creative work | `bfl/flux-2-max`, `bfl/flux-2-flex`, `bfl/flux-2-pro` |
| Other current options | `klingai/kling-v3`, `sapiens-ai/agnes-image-2.1-flash`, `tencent/hy-image-v3.0`, `z-ai/glm-image` |

Catalog presence confirms the model ID, not every protocol or parameter. For
new models, verify the chosen protocol against current ZenMux documentation.
Use preset sizes for `gpt-image-2.5-flare` until its custom-size limits are
explicitly documented; the `gpt-image-2` limits below describe that earlier model.

Route by protocol:

- `openai/gpt-image-*`, bare `gpt-image-*`, and `chatgpt-image-latest` use
  `scripts/generate-openai.ts` and `https://zenmux.ai/api/v1` by default.
- Every other model uses `scripts/generate-gemini.ts` and
  `https://zenmux.ai/api/vertex-ai`.
- If the user explicitly requests Gemini protocol for an OpenAI model, honor it
  with `generate-gemini.ts`.

Google’s direct Gemini API now documents `client.interactions.create` as its
native image-generation surface. ZenMux has not documented that route. Through
ZenMux, continue using `generateContent` for Google Gemini image models and
`generateImages` / `editImage` for all other image models. Do not send an
Interactions API payload to ZenMux until ZenMux explicitly announces support.
The current `@google/genai` SDK warns that `generateImages` is deprecated and
will be removed in its next major release no earlier than 2027-01-01. Treat the
method as a ZenMux compatibility bridge and re-check ZenMux docs before a major
SDK upgrade.

For `gpt-image-2`, custom `WIDTHxHEIGHT` values must have both edges divisible
by 16, an aspect ratio between 1:3 and 3:1, and 655,360-8,294,400 total pixels.
Resolutions above `2560x1440` are experimental; maximum is `3840x2160`.
Other OpenAI image models should use `auto`, `1024x1024`, `1536x1024`, or
`1024x1536`.

## 4. Follow OpenAI Create/Edit best practices

Use the Images API for one-shot generation or editing. Use Responses API only
when the user's actual product needs conversational, multi-turn image state;
the bundled helper intentionally uses Images API.

For generation:

- Call `client.images.generate` through the TypeScript SDK.
- GPT Image returns `b64_json`; decode and save the bytes without transcoding.
- Use `n` for multiple outputs in one request when the model permits it.
- `transparent` backgrounds require PNG or WebP.
- `gpt-image-2` transparent PNG/WebP output is currently a preview capability.
  Request it with `background=transparent`; merely asking for PNG does not
  create an alpha channel.
- `output_compression` applies only to JPEG or WebP.

For editing:

- Call `client.images.edit` and convert local/remote/data-URL bytes with the
  SDK's `toFile` helper.
- Supply at most 16 input images and preserve their order.
- `gpt-image-2` always processes image inputs at high fidelity, so omit
  `input_fidelity`. Use `input_fidelity=high` only for earlier supported GPT
  Image models when identity preservation matters.
- A mask applies to the first input. It must be PNG, under 4 MB, and match the
  first image dimensions. Fully transparent mask areas indicate what to edit.
- State the requested change first, then explicitly list everything that must
  remain invariant.

The scripts accept URL output as a defensive fallback, verify returned image
magic bytes, use timeouts/retries, and never overwrite an existing file.

## 5. Optimize and save the prompt

Resolve the mode from the user's one-off request, otherwise `prompt.mode`.
The calling model performs prompt optimization; this setting is not sent to the
image API and does not trigger another paid model call.

- **`direct` (default):** optimize from the user's request, provided images, and
  the calling model's own judgment. Do not search, read, or borrow prompt examples
  from cookbooks or the web. Skip the cookbook search below. Consult API docs only
  as needed for valid parameters; those are separate from prompt inspiration.
- **`reference`:** use the existing prompt cookbooks to find a few relevant
  examples, then adapt them to the user's intent. Record the cookbook and entry
  used in prompt metadata. If no useful example is available, disclose the
  fallback to direct optimization rather than claiming to have used references.

Both modes accept user-supplied reference **images**, preserve edit invariants,
and use the same confirmation and generation flow. Prompt-reference mode controls
example-prompt research only.

In `reference` mode, search relevant cookbook entries without reading either
cookbook end to end:

```bash
rg -n '^### No\..*(poster|portrait|product|infographic)' \
  .context/zenmux-image-generation/references/awesome-gpt-image-2.md
```

Use `awesome-gpt-image-2.md` for OpenAI-oriented examples and
`awesome-nano-banana-pro-prompts.md` for Gemini-oriented examples. Adapt their
structure, not their subject.

Prompt order:

1. Scene/background and composition
2. Main subject and action
3. Materials, lighting, palette, lens/render style
4. Exact quoted copy, when required
5. Edit relationships between `[Image #N]` inputs
6. Constraints and invariants

For an edit, write surgical instructions such as: "Change only X. Preserve
identity, pose, geometry, camera angle, lighting, framing, background, and all
unmentioned details." Repeat invariants on every follow-up edit.

Save the prompt as:

```text
.context/zenmux-image-generation/prompts/<YYYYMMDD-HHMMSS>-<short-slug>.md
```

Use this format, filling in the effective settings for this invocation:

```markdown
# Optimized prompt — <summary>

- **Prompt mode:** direct
- **Cookbook sources:** none
- **Model:** openai/gpt-image-2.5-flare
- **Size:** 1024x1536
- **Quality:** medium
- **Count:** 4
- **Output format:** png
- **Filename prefix:** launch-poster
- **References:** none
- **Created:** 2026-08-31 14:30 (Asia/Singapore)

---

<optimized prompt body>
```

Show the optimized prompt and parameters to the user. Do not call the paid
generation API until the user confirms. Edit the same prompt file if they ask
for small changes.

## 6. Generate with TypeScript

When config selects an OpenAI image model, generate with its configured defaults
(omit flags unless they intentionally override this invocation's settings):

```bash
npm --prefix skills/zenmux-image-generation run generate:openai -- \
  --prompt-file ".context/zenmux-image-generation/prompts/<file>.md" \
  --filename-prefix "launch-poster"
```

OpenAI edit with ordered references and explicit size/quality overrides:

```bash
npm --prefix skills/zenmux-image-generation run generate:openai -- \
  --prompt-file ".context/zenmux-image-generation/prompts/<file>.md" \
  --filename-prefix "outfit-edit" \
  --size "1024x1536" --quality "high" \
  --reference-image "/absolute/path/person.png" \
  --reference-image "https://example.com/jacket.webp"
```

Add `--mask-image "/absolute/path/mask.png"` for a masked edit. For an earlier
GPT Image model, add `--input-fidelity high` when supported. Add
`--background transparent --output-format png` for a lossless transparent
asset, or use WebP plus `--compression 85` for a smaller transparent asset.

Gemini/Vertex-compatible model:

```bash
npm --prefix skills/zenmux-image-generation run generate:gemini -- \
  --model "google/gemini-3.1-flash-image" \
  --prompt-file ".context/zenmux-image-generation/prompts/<file>.md" \
  --filename-prefix "campaign-poster" \
  --aspect-ratio "2:3" --image-size "1K"
```

The TypeScript Gemini helper covers both ZenMux protocol shapes:

- Google Gemini image models use `generateContent` or `--stream` for
  `generateContentStream`. It always requests `TEXT` and `IMAGE`, supports up
  to 14 ordered references, and uses `--aspect-ratio` / `--image-size` to build
  `imageConfig`.
- Non-Google models use `generateImages`, or `editImage` when references are
  present. Supported CLI mappings include `--negative-prompt`,
  `--aspect-ratio`, `--image-size`, `--seed`, `--enhance-prompt`,
  `--person-generation`, `--safety-filter-level`, `--include-rai-reason`,
  `--add-watermark`, and `--guidance-scale`.
- `--size` and `--quality` are OpenAI passthrough fields when an OpenAI model
  is deliberately called through Gemini protocol. `--image-size` becomes
  `sampleImageSize` for other `generateImages` providers where supported.
- ZenMux Vertex protocol does not map GPT Image's `background` field. Use
  `generate-openai.ts` for transparent GPT Image output.
- Provider defaults vary when `--aspect-ratio` and `--image-size` are omitted.
  Some providers may also return a different MIME type than requested; the
  helper detects PNG/JPEG/WebP magic bytes and saves the matching extension.

`--output-dir` is optional and defaults to the project's
`.context/zenmux-image-generation/output/`. Relative overrides resolve from the
original invocation directory. Pass an override only when the user requests a
different location; the automatic ignore rules cover the runtime workspace.

## 7. Object-storage-safe filenames

Every saved image uses this deterministic shape:

```text
<semantic-prefix>-<model-slug>-<utc-millisecond-timestamp>-<8-hex-run-id>-<index>.<ext>
```

Example:

```text
launch-poster-openai-gpt-image-2-5-flare-20260912t143012345z-a1b2c3d4-01.png
```

This is intentionally conservative for Supabase Storage, S3-compatible APIs,
CDNs, and signed URLs:

- Lowercase ASCII only in the stem: `a-z`, `0-9`, and `-`
- One final `.` before `png`, `jpg`, or `webp`
- No spaces, Unicode, slashes, backslashes, control characters, URL-reserved
  punctuation, leading dots, or `..` segments
- UTC millisecond timestamp for lexical ordering
- Random run ID plus output index to prevent collisions during concurrent runs
- Exclusive file creation so a collision cannot overwrite an existing object

Always pass a concise semantic `--filename-prefix`. If omitted, the script
derives it from the prompt filename and sanitizes it with the same rules.

## 8. Report and iterate

On success, the scripts print `SUCCESS`, `OUTPUT_DIR`, `IMAGE_PATHS`, and a
single-line `RESULT_JSON`. Parse `RESULT_JSON` when another tool needs stable
machine-readable output. Return clickable absolute paths to the user.

For follow-up edits, preserve the selected image as `[Image #1]`, save a new
prompt that restates invariants, confirm it, and run the appropriate edit path.

If generation fails:

- Missing dependency: run `npm ci --prefix skills/zenmux-image-generation`.
- Model unavailable: rerun `list_models.sh --force`; use the exact live ID.
- Invalid size: choose the nearest valid dimensions that preserve aspect ratio.
- Reference rejected: convert it to PNG/JPEG/WebP and keep it under the model's
  input limit.
- Provider rejects multiple outputs: loop calls with `--n 1` and retain the
  same semantic prefix; each run ID keeps filenames unique.
