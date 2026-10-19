#!/usr/bin/env bash
# Refresh external references into the current project's runtime workspace.
#
# Pulls prompt cookbooks, ZenMux protocol docs, OpenAI TypeScript Images SDK
# references, and a ZenMux image-model snapshot into the project workspace.
# Configured refresh intervals skip network requests while cached files are fresh.
# Direct mode skips prompt cookbooks; reference mode refreshes them when due.
#
# Network failures are NOT fatal — the existing local copy is preserved and a
# warning is printed, so the skill can still operate against stale data.
#
# Usage:
#   bash scripts/refresh_references.sh --quiet   # refresh only when due
#   bash scripts/refresh_references.sh --force   # bypass intervals and autoUpdate
#   bash scripts/refresh_references.sh --prompt-mode reference

set -uo pipefail

quiet=0
force=""
prompt_mode=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --quiet) quiet=1 ;;
    --force) force="--force" ;;
    --prompt-mode)
      prompt_mode="${2:-}"
      case "$prompt_mode" in direct|reference) ;; *) echo "--prompt-mode must be direct or reference" >&2; exit 2 ;; esac
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--quiet] [--force] [--prompt-mode direct|reference]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required. Install with 'brew install jq'." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLED_REFERENCES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/references"
RUNTIME_DIR="$(node "$SCRIPT_DIR/workspace.mjs")" || exit 1
config="$(node "$SCRIPT_DIR/workspace.mjs" --config)" || exit 1
if [ -z "$prompt_mode" ]; then
  prompt_mode="$(printf '%s' "$config" | jq -r '.prompt.mode')"
fi
REFERENCES_DIR="$RUNTIME_DIR/references"
# Seed missing references for first-run offline use; never overwrite a newer cache.
for source in "$BUNDLED_REFERENCES_DIR"/*.md "$BUNDLED_REFERENCES_DIR"/*.json; do
  [ -f "$source" ] || continue
  if [ "$prompt_mode" = "direct" ] && [[ "$(basename "$source")" == awesome-* ]]; then
    continue
  fi
  target="$REFERENCES_DIR/$(basename "$source")"
  [ -f "$target" ] || cp -n "$source" "$target" || exit 1
done

# source URL => target filename
declare -a sources=(
  "https://raw.githubusercontent.com/ZenMux/zenmux-doc/main/docs_source/en/guide/advanced/image-generation.md|zenmux-image-generation.md"
  "https://raw.githubusercontent.com/ZenMux/zenmux-doc/main/docs_source/en/api/vertexai/generate-images.md|zenmux-generate-images.md"
  "https://raw.githubusercontent.com/ZenMux/zenmux-doc/main/docs_source/zh/guide/advanced/openai-image-generation.md|zenmux-openai-image-generation.md"
  "https://raw.githubusercontent.com/ZenMux/zenmux-doc/main/docs_source/zh/api/openai/create-image-edit.md|zenmux-create-image-edit.md"
  "https://developers.openai.com/api/reference/typescript/resources/images/methods/generate/index.md|openai-typescript-images-generate.md"
  "https://developers.openai.com/api/reference/typescript/resources/images/methods/edit/index.md|openai-typescript-images-edit.md"
)
if [ "$prompt_mode" = "reference" ]; then
  sources+=(
    "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README.md|awesome-gpt-image-2.md"
    "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main/README.md|awesome-nano-banana-pro-prompts.md"
  )
fi

failures=0
for entry in "${sources[@]}"; do
  url="${entry%%|*}"
  fname="${entry##*|}"
  target="$REFERENCES_DIR/$fname"

  has_cache="no"
  [ -s "$target" ] && has_cache="yes"
  decision="$(node "$SCRIPT_DIR/refresh-state.mjs" check "$fname" references "$has_cache" "$force")" || exit 1
  if [ "$decision" != "refresh" ]; then
    if [ "$quiet" -eq 0 ]; then printf 'skipped %s (%s)\n' "$fname" "$decision"; fi
    continue
  fi
  node "$SCRIPT_DIR/refresh-state.mjs" attempt "$fname" || exit 1

  # Download to a tempfile first so a partial response never overwrites the
  # existing copy.
  tmp="$(mktemp "$REFERENCES_DIR/.${fname}.XXXXXX")" || exit 1
  if curl -sfL --max-time 30 -o "$tmp" "$url"; then
    if [ -s "$tmp" ]; then
      mv "$tmp" "$target" || exit 1
      node "$SCRIPT_DIR/refresh-state.mjs" success "$fname" || exit 1
      if [ "$quiet" -eq 0 ]; then
        bytes=$(wc -c < "$target" | tr -d ' ')
        lines=$(wc -l < "$target" | tr -d ' ')
        printf 'refreshed %s  (%s lines, %s bytes)\n' "$fname" "$lines" "$bytes"
      fi
    else
      rm -f "$tmp"
      echo "warning: $url returned empty body, kept previous local copy" >&2
      failures=$((failures + 1))
    fi
  else
    rm -f "$tmp"
    if [ -f "$target" ]; then
      echo "warning: failed to fetch $url, kept previous local copy at $target" >&2
    else
      echo "error: failed to fetch $url and no local copy exists at $target" >&2
    fi
    failures=$((failures + 1))
  fi
done

models_target="$REFERENCES_DIR/zenmux-image-models.json"
model_args=(--snapshot)
if [ -n "$force" ]; then model_args+=("$force"); fi
if bash "$SCRIPT_DIR/list_models.sh" "${model_args[@]}" >/dev/null; then
  if [ "$quiet" -eq 0 ]; then
    printf 'model catalog available  (%s image models; see warnings for offline fallback)\n' "$(jq length "$models_target")"
  fi
else
  if [ -f "$models_target" ]; then
    echo "warning: failed to refresh image-model catalog, kept $models_target" >&2
  else
    echo "warning: failed to refresh image-model catalog and no snapshot exists" >&2
  fi
fi

# Exit 0 even on partial failure — the skill can still run against the local
# copy. Only return non-zero if no reference is available at all.
if [ "$failures" -eq "${#sources[@]}" ]; then
  # All refresh attempts failed; check whether any local copy exists.
  any_local=0
  for entry in "${sources[@]}"; do
    fname="${entry##*|}"
    [ -f "$REFERENCES_DIR/$fname" ] && any_local=1
  done
  if [ "$any_local" -eq 0 ]; then
    exit 1
  fi
fi
exit 0
