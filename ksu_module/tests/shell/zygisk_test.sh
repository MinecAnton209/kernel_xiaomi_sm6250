#!/bin/sh
# Builds and runs the host tests for the GL hook's settings parser. Usage: sh ksu_module/tests/shell/zygisk_test.sh
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
CXX=${CXX:-c++}

"$CXX" -std=c++17 -Wall -Wextra -Werror -o "$WORK/gl_config_test" "$ROOT/tests/zygisk/gl_config_test.cpp" || exit 1
"$WORK/gl_config_test"
