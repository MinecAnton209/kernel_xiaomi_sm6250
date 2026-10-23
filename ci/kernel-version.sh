#!/usr/bin/env bash
# Usage: kernel-version.sh [SOURCE_DIR]
# Prints the version a kernel build reports: miatoll.version alone on an exact v* tag (a release),
# and miatoll.version with the short commit (1.0.0-3f9a2c1) on every other build. Outside a git
# checkout there is no commit to add, so the plain version is printed.
set -euo pipefail

dir="${1:-.}"
version=$(cat "$dir/miatoll.version" 2> /dev/null || echo unknown)
version=${version//[[:space:]]/}

if git -C "$dir" describe --tags --exact-match --match 'v*' HEAD > /dev/null 2>&1; then
  printf '%s\n' "$version"
  exit 0
fi

commit=$(git -C "$dir" rev-parse --short HEAD 2> /dev/null || true)
if [ -n "$commit" ]; then
  printf '%s-%s\n' "$version" "$commit"
else
  printf '%s\n' "$version"
fi
