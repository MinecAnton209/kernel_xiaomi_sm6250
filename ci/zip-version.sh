#!/usr/bin/env bash
# Usage: zip-version.sh <file>
# Prints the version= value from the module.prop at the root of a zip, so the manifest can name the
# exact version of a module build (v1.1.0-7ae22c4) even when the zip was kept from an earlier run.
# A kernel zip has no module.prop; its kernel_version file names the kernel (1.0.0 or 1.0.0-3f9a2c1).
# Prints nothing for a file that is not a zip, or has neither; always exits 0.
file="$1"

case "$file" in
*.zip) ;;
*) exit 0 ;;
esac
[ -f "$file" ] || exit 0

version=$(unzip -p "$file" module.prop 2> /dev/null | tr -d '\r' | sed -n 's/^version=//p' | head -n 1)
if [ -z "$version" ]; then
  version=$(unzip -p "$file" kernel_version 2> /dev/null | tr -d '\r' | head -n 1)
fi
[ -n "$version" ] && printf '%s\n' "$version"
exit 0
