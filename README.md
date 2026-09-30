# Linux kernel — Xiaomi Redmi Note 9 Pro (miatoll / sm6250)

[![Linux kernel 4.14.336](https://img.shields.io/badge/Linux%20kernel-4.14.336-ff0000?logo=kernel)](https://www.kernel.org/)
[![arch: arm64](https://img.shields.io/badge/arch-arm64-blue)](https://www.kernel.org/)
[![SoC: Qualcomm sm6250](https://img.shields.io/badge/SoC-Qualcomm%20sm6250-brightgreen)](https://www.qualcomm.com/)

A Linux kernel tree based on **Linux 4.14.336**, configured for the Qualcomm **sm6250** platform — the SoC used in the **Xiaomi Redmi Note 9 Pro / 9 S / 9 Pro Max** family (board codename `miatoll` and its variants `curtana`, `joyeuse`, `gram`, `excalibur`).

## What it does

- Boots the `sm6250` board from `arch/arm64/boot/Image.gz`.
- Brings up the phone's peripherals: display, USB, cameras, audio, thermal, charging, WiFi/BT coexistence and the Qualcomm SPMI/PMIC.
- Provides the base the vendor and device trees (`device_xiaomi_miatoll`, `vendor_xiaomi_miatoll`) bind against.
- Produces a flashable boot image together with **AnyKernel3**.

## Prerequisites

Build host (Linux):

```bash
gcc g++ make libelf-dev libssl-dev bc flex bison git rsync unzip
```

Toolchain: an **LLVM/Clang** toolchain (this tree was built with **Proton Clang 13**). Set a variable pointing to its `bin` directory, for example `~/clang/bin`, and call it `CLANG_PATH`.

```bash
CLANG_PATH=~/clang/bin        # <-- edit to your clang location
export CLANG_PATH
```

## Building

All commands run from the kernel source root. Output goes to `out/` (which is listed in `.gitignore`, so build artifacts are never committed).

```bash
# 1. create the output directory
mkdir -p out

# 2. generate .config from the board defconfig
make O=out ARCH=arm64 vendor/xiaomi/miatoll_defconfig

# 3. make the config deterministic (answers any new prompts with defaults)
make O=out ARCH=arm64 olddefconfig

# 4. compile the compressed kernel image
make -j$(nproc) O=out \
    ARCH=arm64 \
    HOSTCC=gcc \
    HOSTCXX=g++ \
    HOSTLD=ld \
    CC=$CLANG_PATH/clang \
    LD=$CLANG_PATH/ld.lld \
    AR=$CLANG_PATH/llvm-ar \
    NM=$CLANG_PATH/llvm-nm \
    OBJCOPY=$CLANG_PATH/llvm-objcopy \
    OBJDUMP=$CLANG_PATH/llvm-objdump \
    STRIP=$CLANG_PATH/llvm-strip \
    CLANG_TRIPLE=aarch64-linux-gnu- \
    CROSS_COMPILE=$CLANG_PATH/aarch64-linux-gnu- \
    CROSS_COMPILE_COMPAT=$CLANG_PATH/arm-linux-gnueabi- \
    Image.gz
```

The result is:

```
out/arch/arm64/boot/Image.gz
```

To also build loadable modules instead of `Image.gz`:

```bash
make -j$(nproc) O=out ARCH=arm64 \
    CC=$CLANG_PATH/clang \
    CLANG_TRIPLE=aarch64-linux-gnu- \
    CROSS_COMPILE=$CLANG_PATH/aarch64-linux-gnu- \
    modules
```

## Making a flashable boot image (AnyKernel3)

`AnyKernel3/` (a sibling directory) is a ready-to-use flasher: it takes your `Image.gz` and repacks it together with the existing device boot partition's ramdisk.

```bash
# copy the freshly built kernel into the AnyKernel3 folder
cp out/arch/arm64/boot/Image.gz /path/to/AnyKernel3/Image.gz

# package it
cd /path/to/AnyKernel3
zip -r9 ../miatoll-kernel-$(date +%F).zip .

# flash the zip through TWRP/OFR
```

## Enabling specific options (`scripts/config`)

For a single, well‑known toggle the full `menuconfig`/`nconfig` UI is overkill.
The tree ships a tiny helper that flips one symbol in `out/.config` and leaves
the tracked source tree untouched (only the gitignored `out/` changes):

```bash
scripts/config --file out/.config --enable CONFIG_FOO
make -j$(nproc) O=out ARCH=arm64 olddefconfig   # resolve dependencies, then build
```

Run `scripts/config --help` for the other verbs (--disable, --set-str, --set-val).

## Notes

- **Defconfig sync.** To regenerate `miatoll_defconfig` so it stays in sync with a configured `.config` (without dumping 5000+ lines of kernel defaults), use the kernel's own `savedefconfig`:

  ```bash
  make O=out ARCH=arm64 savedefconfig
  cp out/defconfig arch/arm64/configs/vendor/xiaomi/miatoll_defconfig.new
  ```

  Then review with `diff -u arch/arm64/configs/vendor/xiaomi/miatoll_defconfig defconfig` and commit the changes to `miatoll_defconfig`.

- **Clean rebuilds.** `out/` is gitignored; wipe it with `make O=out mrproper` or `rm -rf out/*` to restart from the defconfig.

## License

The kernel is released under **GPL-2.0** (see [`COPYING`](COPYING)). Patches added on top inherit the same license.
