#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Build miatoll kernel Image.gz and pack a flashable AnyKernel3 zip.
#
# Usage:
#   ./build_miatoll.sh [zip-name]
#   ./build_miatoll.sh release.zip
#   DEFCONFIG=vendor/xiaomi/miatoll_defconfig ./build_miatoll.sh
#   NETHUNTER=1 ./build_miatoll.sh nh.zip  # merge nethunter fragment first
#   SKIP_BUILD=1 ./build_miatoll.sh        # reuse existing Image.gz, just repack
#   IMAGE=/path/to/Image.gz ./build_miatoll.sh custom.zip
#
# Env overrides: KDIR (kernel root, default: script dir),
#   AK3_DIR (submodule checkout, default: $KDIR/AnyKernel3),
#   OUT_DIR (kernel O= dir), CLANG_DIR, JOBS, NETHUNTER=1,
#   SKIP_BUILD=1, IMAGE=/path/to/Image.gz, DEFCONFIG=... ,
#   USE_CCACHE=1 (wrap compiler via ccache), CCACHE_DIR.
#
# First clone: git submodule update --init AnyKernel3

set -e

KDIR="${KDIR:-$(cd "$(dirname "$0")" && pwd)}"
AK3_DIR="${AK3_DIR:-$KDIR/AnyKernel3}"
OUT_DIR="${OUT_DIR:-$KDIR/out}"
CLANG_DIR="${CLANG_DIR:-$(dirname "$KDIR")/clang/bin}"
CCACHE_DIR="${CCACHE_DIR:-$HOME/.ccache}"
DEFCONFIG="${DEFCONFIG:-vendor/xiaomi/miatoll_defconfig}"
ZIP_NAME="${1:-miatoll_$(date +%Y%m%d).zip}"
JOBS="${JOBS:-$(nproc)}"

export ARCH=arm64
if [ "$USE_CCACHE" = "1" ]; then
	command -v ccache >/dev/null || { echo "ccache not installed"; exit 1; }
	CC="ccache $CLANG_DIR/clang"
	export CCACHE_DIR CCACHE_MAXSIZE="${CCACHE_MAXSIZE:-5G}"
	ccache -z >/dev/null
else
	CC="$CLANG_DIR/clang"
fi
# Full LLVM toolchain, matching the known-good local command line.
# LD=ld.lld keeps LTO links off GNU gold (vdso -shared breaks under
# gold+LLVMgold); the llvm-* tools match Proton Clang 13.
MAKE_ARGS="ARCH=arm64 CC=\"$CC\" LD=$CLANG_DIR/ld.lld"
MAKE_ARGS="$MAKE_ARGS AR=$CLANG_DIR/llvm-ar NM=$CLANG_DIR/llvm-nm"
MAKE_ARGS="$MAKE_ARGS OBJCOPY=$CLANG_DIR/llvm-objcopy"
MAKE_ARGS="$MAKE_ARGS OBJDUMP=$CLANG_DIR/llvm-objdump"
MAKE_ARGS="$MAKE_ARGS STRIP=$CLANG_DIR/llvm-strip"
MAKE_ARGS="$MAKE_ARGS CLANG_TRIPLE=aarch64-linux-gnu-"
MAKE_ARGS="$MAKE_ARGS CROSS_COMPILE=$CLANG_DIR/aarch64-linux-gnu-"
MAKE_ARGS="$MAKE_ARGS CROSS_COMPILE_COMPAT=$CLANG_DIR/arm-linux-gnueabi-"
export ARCH CLANG_TRIPLE CROSS_COMPILE CROSS_COMPILE_COMPAT
export CLANG_TRIPLE=aarch64-linux-gnu-
export CROSS_COMPILE="$CLANG_DIR/aarch64-linux-gnu-"
export CROSS_COMPILE_COMPAT="$CLANG_DIR/arm-linux-gnueabi-"

if [ -n "$IMAGE" ]; then
	IMG="$IMAGE"
elif [ "$SKIP_BUILD" = "1" ]; then
	IMG="$OUT_DIR/arch/arm64/boot/Image.gz"
else
	mkdir -p "$OUT_DIR"
	if [ "$NETHUNTER" = "1" ]; then
		echo "==> merging NetHunter fragment"
		(cd "$KDIR" && ARCH=arm64 \
			KCONFIG_CONFIG="$OUT_DIR/.config" \
			./scripts/kconfig/merge_config.sh -O "$OUT_DIR" \
			"arch/arm64/configs/$DEFCONFIG" \
			arch/arm64/configs/vendor/xiaomi/miatoll_nethunter.cfg)
	else
		echo "==> defconfig: $DEFCONFIG"
		make -C "$KDIR" O="$OUT_DIR" "$DEFCONFIG"
	fi

	echo "==> building Image.gz (-j$JOBS)"
	# NOTE: CC/LD must go on the make command line, not just via export:
	# the top-level Makefile reassigns CC = $(CROSS_COMPILE)gcc, which
	# overrides environment but loses to command-line variables. LD=ld.lld
	# keeps LTO links off GNU gold (vdso -shared breaks under gold).
	eval make -C "$KDIR" O="$OUT_DIR" -j"$JOBS" $MAKE_ARGS Image.gz

	if [ "$USE_CCACHE" = "1" ]; then
		echo "==> ccache stats"
		ccache -s
	fi

	IMG="$OUT_DIR/arch/arm64/boot/Image.gz"
fi
[ -f "$IMG" ] || { echo "Image.gz missing: $IMG"; exit 1; }

echo "==> packing $ZIP_NAME"
if [ ! -f "$AK3_DIR/ak3-core.sh" ] && [ ! -f "$AK3_DIR/tools/ak3-core.sh" ]; then
	echo "Missing AnyKernel3 checkout: run"
	echo "  git submodule update --init AnyKernel3"
	echo "or set AK3_DIR to your AnyKernel3 fork."
	exit 1
fi
cp "$IMG" "$AK3_DIR/Image.gz"
(cd "$AK3_DIR" && zip -r9 "$KDIR/$ZIP_NAME" * \
	-x '.git*' README.md AnyKernel3.png Image.gz.bak)

echo "==> done: $KDIR/$ZIP_NAME"
ls -lh "$KDIR/$ZIP_NAME"
