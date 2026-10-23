#!/usr/bin/env bash
# Usage: stamp-module-version.sh <module.prop> <commit-sha> [run-number]
# Turns "version=v1.1.0" into "version=v1.1.0-<first 7 characters of the sha>", so a module built
# from a branch tells which commit it came from. Run it again and the suffix is replaced, not stacked.
# With a run number it also writes "build=<run number>", the number in the name of the zip that CI
# publishes (kernel_control-<run number>.zip), so the WebUI can tell whether it has the newest build.
# Release builds skip this script, and keep the version exactly as written in module.prop.
set -euo pipefail

prop="$1"
sha="$2"
run="${3:-}"

if [ -n "$run" ] && ! [[ "$run" =~ ^[0-9]{1,9}$ ]]; then
  echo "stamp-module-version: '$run' is not a run number" >&2
  exit 1
fi

if ! [[ "$sha" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "stamp-module-version: '$sha' is not a commit hash" >&2
  exit 1
fi
if ! grep -q '^version=' "$prop"; then
  echo "stamp-module-version: no version= line in $prop" >&2
  exit 1
fi

short=$(printf '%s' "${sha:0:7}" | tr 'A-F' 'a-f')
tmp=$(mktemp "$prop.XXXXXX")
trap 'rm -f "$tmp"' EXIT

awk -v short="$short" -v run="$run" '
  /^version=/ {
    value = substr($0, 9)
    sub(/-[0-9a-f]{7}$/, "", value)
    print "version=" value "-" short
    next
  }
  run != "" && /^build=/ { next }
  { print }
  END { if (run != "") print "build=" run }
' "$prop" > "$tmp"

cat "$tmp" > "$prop"
