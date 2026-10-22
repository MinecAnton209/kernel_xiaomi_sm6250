#!/usr/bin/env bash
# Keeps the rolling "unreleased" pre-release whole when only one of the two builds ran.
#
#   prerelease-assets.sh gather <tag> <keep> <new-dir> <all-dir>
#   prerelease-assets.sh clean  <tag> <keep>
#
# <keep> is a list of globs separated by "|" naming the assets of the build that was skipped,
# for example "miatoll-*|Image-*"; it is empty when both builds ran and nothing is kept.
#   gather  copies the new assets and the kept ones (downloaded from the release) into <all-dir>,
#           so the manifest lists every file the release will hold. A file built in this run wins
#           over a kept one with the same name.
#   clean   deletes every asset of the release except the kept ones, including the old manifest.
# Needs the GitHub CLI (gh) with GH_TOKEN set.
set -euo pipefail

matches_keep() {
  local name=$1 keep=$2 pattern
  local -a patterns
  [ -n "$keep" ] || return 1
  IFS='|' read -ra patterns <<< "$keep"
  for pattern in "${patterns[@]}"; do
    # shellcheck disable=SC2053 # the pattern is meant to be a glob
    [[ "$name" == $pattern ]] && return 0
  done
  return 1
}

gather() {
  local tag=$1 keep=$2 new=$3 all=$4
  local kept pattern file name
  local -a patterns args=()

  mkdir -p "$all"
  cp -R -- "$new"/. "$all"/
  [ -n "$keep" ] || return 0

  kept=$(mktemp -d)
  IFS='|' read -ra patterns <<< "$keep"
  for pattern in "${patterns[@]}"; do
    args+=(--pattern "$pattern")
  done

  if ! gh release download "$tag" "${args[@]}" --dir "$kept" 2> /dev/null; then
    echo "::warning::no earlier assets matching '$keep' in release $tag; publishing only the new ones" >&2
    return 0
  fi

  for file in "$kept"/*; do
    [ -e "$file" ] || continue
    name=$(basename -- "$file")
    [ -e "$all/$name" ] || cp -- "$file" "$all/$name"
  done
}

clean() {
  local tag=$1 keep=$2 names name
  # The release does not exist on the very first run, which is fine: there is nothing to clear.
  names=$(gh release view "$tag" --json assets --jq '.assets[].name' 2> /dev/null || true)
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if matches_keep "$name" "$keep"; then
      continue
    fi
    gh release delete-asset "$tag" "$name" --yes
  done <<< "$names"
}

case "${1:-}" in
gather)
  [ $# -eq 5 ] || { echo "usage: $0 gather <tag> <keep> <new-dir> <all-dir>" >&2; exit 1; }
  gather "$2" "$3" "$4" "$5"
  ;;
clean)
  [ $# -eq 3 ] || { echo "usage: $0 clean <tag> <keep>" >&2; exit 1; }
  clean "$2" "$3"
  ;;
*)
  echo "usage: $0 gather <tag> <keep> <new-dir> <all-dir> | clean <tag> <keep>" >&2
  exit 1
  ;;
esac
