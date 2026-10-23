#!/usr/bin/env bash
# Usage: zip-version.sh <file>
# Prints the version= value from the module.prop at the root of a zip, so the manifest can name the
# exact version of a module build (v1.1.0-7ae22c4) even when the zip was kept from an earlier run.
# Prints nothing for a file that is not a zip, has no module.prop, or has no version line; always exits 0.
file="$1"

case "$file" in
*.zip) ;;
*) exit 0 ;;
esac
[ -f "$file" ] || exit 0

unzip -p "$file" module.prop 2> /dev/null | tr -d '\r' | sed -n 's/^version=//p' | head -n 1
exit 0
