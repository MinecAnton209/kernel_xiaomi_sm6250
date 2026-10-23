#!/bin/sh
# Builds the GL_RENDERER hook as the module's zygisk/arm64-v8a.so with the Android NDK clang.
# Usage: sh ksu_module/zygisk/build.sh OUT_FILE
# CLANG overrides the compiler; the default is the NDK on the WSL mount used by this project.
HERE="$(cd "$(dirname "$0")" && pwd)"
CLANG=${CLANG:-/mnt/e/Android-sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/bin/clang++.exe}
[ -n "$1" ] || { echo "usage: $0 OUT_FILE" >&2; exit 2; }
"$CLANG" --target=aarch64-linux-android35 -std=c++17 -Wall -Wextra -O2 -fPIC -shared \
	-static-libstdc++ -I"$HERE" -o "$1" "$HERE/gl_spoof.cpp" -llog
