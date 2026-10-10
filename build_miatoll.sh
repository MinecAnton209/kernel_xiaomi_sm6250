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
#   SKIP_BUILD=1, IMAGE=/path/to/Image.gz, DEFCONFIG=... .
#
# First clone: git submodule update --init AnyKernel3

set -e

KDIR="${KDIR:-$(cd "$(dirname "$0")" && pwd)}"
AK3_DIR="${AK3_DIR:-$KDIR/AnyKernel3}"
OUT_DIR="${OUT_DIR:-$KDIR/out}"
CLANG_DIR="${CLANG_DIR:-$(dirname "$KDIR")/clang/bin}"
DEFCONFIG="${DEFCONFIG:-vendor/xiaomi/miatoll_defconfig}"
ZIP_NAME="${1:-miatoll_$(date +%Y%m%d).zip}"
JOBS="${JOBS:-$(nproc)}"

export ARCH=arm64
export CC="$CLANG_DIR/clang"
export CLANG_TRIPLE=aarch64-linux-gnu-
export CROSS_COMPILE="$CLANG_DIR/aarch64-linux-gnu-"

if [ -n "$IMAGE" ]; then
	IMG="$IMAGE"
elif [ "$SKIP_BUILD" = "1" ]; then
	IMG="$OUT_DIR/arch/arm64/boot/Image.gz"
else
	if [ "$NETHUNTER" = "1" ]; then
		echo "==> merging NetHunter fragment"
		(cd "$KDIR" && ARCH=arm64 \
			./scripts/kconfig/merge_config.sh -m -O "$OUT_DIR" \
			"arch/arm64/configs/$DEFCONFIG" \
			arch/arm64/configs/vendor/xiaomi/miatoll_nethunter.cfg)
	else
		echo "==> defconfig: $DEFCONFIG"
		make -C "$KDIR" O="$OUT_DIR" "$DEFCONFIG"
	fi

	echo "==> building Image.gz (-j$JOBS)"
	make -C "$KDIR" O="$OUT_DIR" -j"$JOBS" Image.gz

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
