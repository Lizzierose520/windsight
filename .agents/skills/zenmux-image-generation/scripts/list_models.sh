#!/usr/bin/env bash
# List image models from both ZenMux catalogs, with project-cache and bundled fallbacks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLED_SNAPSHOT="$(cd "$SCRIPT_DIR/.." && pwd)/references/zenmux-image-models.json"

mode="table"
force=""
for arg in "$@"; do
  case "$arg" in
    --json) mode="json" ;;
    --snapshot) mode="snapshot" ;;
    --names-only) mode="names" ;;
    --force) force="--force" ;;
    --help|-h)
      echo "Usage: $0 [--json|--names-only|--snapshot] [--force]"
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: 'jq' is required but not found. Install with 'brew install jq'." >&2
  exit 1
fi

RUNTIME_DIR="$(node "$SCRIPT_DIR/workspace.mjs")"
SNAPSHOT="$RUNTIME_DIR/references/zenmux-image-models.json"
valid_snapshot() {
  jq -e 'type == "array" and length > 0 and all(.[];
    (.name | type == "string") and ((.outputModalities // []) | index("image") != null))' "$1" >/dev/null 2>&1
}

fallback=""
for candidate in "$SNAPSHOT" "$BUNDLED_SNAPSHOT"; do
  if [ -f "$candidate" ] && valid_snapshot "$candidate"; then
    fallback="$candidate"
    break
  fi
done

models='[]'
successes=0
has_cache="no"
[ -n "$fallback" ] && has_cache="yes"
decision="$(node "$SCRIPT_DIR/refresh-state.mjs" check models models "$has_cache" "$force")"
if [ "$decision" != "refresh" ]; then
  if [ -z "$fallback" ]; then
    echo "Error: refresh is $decision and no valid model snapshot exists; use --force to fetch" >&2
    exit 1
  fi
  if [ "$decision" = "retry-later" ]; then
    echo "warning: model refresh retry deferred; using $fallback (use --force to retry now)" >&2
  fi
  models=$(cat "$fallback")
else
  node "$SCRIPT_DIR/refresh-state.mjs" attempt models
  for endpoint in "https://zenmux.ai/api/v1/models" "https://zenmux.ai/api/vertex-ai/v1beta/models"; do
    if response=$(curl -sfL --max-time 15 "$endpoint") && \
      catalog=$(printf '%s' "$response" | jq -e '
        (if (.data | type) == "array" then
          [.data[] | {name: .id, displayName: (.display_name // ""),
            inputModalities: (.input_modalities // []), outputModalities: (.output_modalities // [])}]
        elif (.models | type) == "array" then
          [.models[] | {name, displayName: (.displayName // ""),
            inputModalities: (.inputModalities // []), outputModalities: (.outputModalities // [])}]
        else error("Invalid model catalog") end)
        | map(select((.outputModalities | index("image")) and (.name | type == "string")))
        | if length > 0 then . else error("Empty image catalog") end' 2>/dev/null); then
      models=$(printf '%s\n%s' "$models" "$catalog" | jq -s 'add | unique_by(.name)')
      successes=$((successes + 1))
    else
      echo "warning: live model catalog unavailable at $endpoint" >&2
    fi
  done

  if [ "$successes" -eq 0 ]; then
    if [ -z "$fallback" ]; then
      echo "Error: live model catalogs unavailable and no valid snapshot exists" >&2
      exit 1
    fi
    echo "warning: using offline model snapshot at $fallback" >&2
    models=$(cat "$fallback")
  else
    if [ "$successes" -lt 2 ] && [ -n "$fallback" ]; then
      echo "warning: partial live catalog; retaining additional models from $fallback" >&2
      models=$(printf '%s\n%s' "$(cat "$fallback")" "$models" | jq -s 'add | group_by(.name) | map(last)')
    fi
    snapshot_tmp="$(mktemp "$SNAPSHOT.XXXXXX")"
    printf '%s\n' "$models" > "$snapshot_tmp"
    mv "$snapshot_tmp" "$SNAPSHOT"
    if [ "$successes" -eq 2 ]; then
      node "$SCRIPT_DIR/refresh-state.mjs" success models
    fi
  fi
fi

filter_expr='
  .[]
  | {
      name: .name,
      displayName: (.displayName // ""),
      inputModalities: (.inputModalities // []),
      family: ((.name | split("/"))[0])
    }
'

case "$mode" in
  snapshot) echo "$models" ;;
  json) echo "$models" | jq "[ $filter_expr ]" ;;
  names) echo "$models" | jq -r "$filter_expr | .name" ;;
  table)
    {
      printf 'NAME\tDISPLAY_NAME\tINPUT_MODALITIES\tFAMILY\n'
      echo "$models" | jq -r "$filter_expr | [.name, .displayName, (.inputModalities | join(\",\")), .family] | @tsv"
    } | column -t -s $'\t'
    ;;
esac
