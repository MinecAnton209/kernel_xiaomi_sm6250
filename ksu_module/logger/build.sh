#!/bin/sh
# Builds kc_logger with SQLite compiled in. Usage: build.sh arm64|host
#   arm64  static Android binary with the NDK clang, copied to kernel_control/bin/kc_logger
#   host   binary for the tests, written to build/kc_logger.host
# The SQLite amalgamation is downloaded once into build/ and its SHA3-256 is checked first.
# NDK_CLANG and NDK_STRIP override the NDK tools; HOST_CC overrides the host compiler.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work="$here/build"
bin="$here/../kernel_control/bin"

SQLITE_ZIP_URL=https://sqlite.org/2025/sqlite-amalgamation-3490100.zip
SQLITE_SHA3=e7eb4cfb2d95626e782cfa748f534c74482f2c3c93f13ee828b9187ce05b2da7
NDK_BIN=/mnt/e/Android-sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/bin
NDK_CLANG=${NDK_CLANG:-$NDK_BIN/clang.exe}
# The Windows llvm-strip deletes the file it edits when it runs from WSL, so the Linux one strips it.
STRIP=${STRIP:-$here/../../../clang/bin/llvm-strip}
HOST_CC=${HOST_CC:-cc}

SQLITE_FLAGS="-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_OMIT_DEPRECATED -DSQLITE_DQS=0"

fetch_sqlite() {
	mkdir -p "$work"
	if [ ! -f "$work/sqlite3.c" ] || [ ! -f "$work/sqlite3.h" ]; then
		curl -sSL -C - -o "$work/amalgamation.zip" "$SQLITE_ZIP_URL"
		actual=$(python3 -c 'import hashlib,sys; print(hashlib.sha3_256(open(sys.argv[1], "rb").read()).hexdigest())' "$work/amalgamation.zip")
		if [ "$actual" != "$SQLITE_SHA3" ]; then
			rm -f "$work/amalgamation.zip"
			echo "sqlite checksum mismatch: $actual" >&2
			exit 1
		fi
		python3 -c 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1])
for name in z.namelist():
    if name.endswith(("/sqlite3.c", "/sqlite3.h")):
        open(sys.argv[2] + "/" + name.rsplit("/", 1)[1], "wb").write(z.read(name))' "$work/amalgamation.zip" "$work"
	fi
}

case "${1:-}" in
arm64)
	fetch_sqlite
	cd "$work"
	# Relative paths only: the Windows clang does not read WSL absolute paths.
	"$NDK_CLANG" --target=aarch64-linux-android24 -static -Os -Wall $SQLITE_FLAGS -I. \
		-o kc_logger.arm64 ../kc_logger.c sqlite3.c
	"$STRIP" kc_logger.arm64
	cp kc_logger.arm64 "$bin/kc_logger"
	;;
host)
	fetch_sqlite
	cd "$work"
	"$HOST_CC" -O2 -Wall $SQLITE_FLAGS -I. -o kc_logger.host ../kc_logger.c sqlite3.c -lm
	;;
*)
	echo "usage: $0 arm64|host" >&2
	exit 1
	;;
esac
