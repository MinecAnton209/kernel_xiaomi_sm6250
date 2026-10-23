#!/usr/bin/env bash
# Usage: make-manifest.sh <changelog-section> <assets-dir> <output.json>
# Needs REPO (owner/name), TAG (release tag), COMMIT and RUN_NUMBER in the env.
set -euo pipefail

section="$1"
assets_dir="$2"
out="$3"

changelog=$(awk -v header="## [${section}]" '
  index($0, header) == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' CHANGELOG.md)

assets=$(
  for file in "$assets_dir"/*; do
    name=$(basename "$file")
    [ "$name" = "manifest.json" ] && continue
    # A module zip carries its own version (v1.1.0-7ae22c4); a zip kept from an earlier run keeps its own.
    jq -n \
      --arg name "$name" \
      --arg url "https://github.com/${REPO}/releases/download/${TAG}/${name}" \
      --argjson size "$(stat -c %s "$file")" \
      --arg sha256 "$(sha256sum "$file" | cut -d' ' -f1)" \
      --arg version "$(bash "$(dirname "${BASH_SOURCE[0]}")/zip-version.sh" "$file")" \
      '{name: $name, url: $url, size: $size, sha256: $sha256}
        + (if $version == "" then {} else {version: $version} end)'
  done | jq -s '.'
)

jq -n \
  --arg commit "$COMMIT" \
  --arg tag "$TAG" \
  --arg run "$RUN_NUMBER" \
  --arg built_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg changelog "$changelog" \
  --argjson assets "$assets" \
  '{schema: 1, tag: $tag, commit: $commit, run: ($run | tonumber), built_at: $built_at,
    changelog: $changelog, assets: $assets}' > "$out"
