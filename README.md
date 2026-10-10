# Linux kernel — Xiaomi Redmi Note 9 Pro (miatoll / sm6250)

[![Linux kernel 4.14.336](https://img.shields.io/badge/Linux%20kernel-4.14.336-ff0000?logo=kernel)](https://www.kernel.org/)
[![arch: arm64](https://img.shields.io/badge/arch-arm64-blue)](https://www.kernel.org/)
[![SoC: Qualcomm sm6250](https://img.shields.io/badge/SoC-Qualcomm%20sm6250-brightgreen)](https://www.qualcomm.com/)

A Linux kernel tree based on **Linux 4.14.336**, configured for the Qualcomm **sm6250** platform — the SoC used in the **Xiaomi Redmi Note 9 Pro / 9 S / 9 Pro Max** family (board codename `miatoll` and its variants `curtana`, `joyeuse`, `gram`, `excalibur`).

## What's inside (on top of vendor)

- **DualSense / DualSense Edge**: bind 0x0df2, Fn buttons + paddles, vibration v2, headset-jack audio routing, LED classdev + `player_id` sysfs.
- **Wine fsync**: `FUTEX_WAIT_MULTIPLE` (opcode 31) backport so Proton/Winlator gets `fsync: up and running` instead of eventfd fallback.
- **Bypass charging**: `bypass_charging` sysfs on the SMB5 charger — system runs off USB input, battery stays idle (no heat cycling while gaming on cable).
- **Emulation + daily tune**: THP madvise, BBR + FQ, `schedutil` default governor, `deadline` I/O scheduler, debug overhead removed, cooler tethering (conntrack helpers dropped).
- **NetHunter fragment**: `arch/arm64/configs/vendor/xiaomi/miatoll_nethunter.cfg` — USB Wi-Fi (ATH9K_HTC, RT2x00, RTL8xxxU, RTW88), USB serial, HIDRAW, Ethernet dongles. Base defconfig stays lean.

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

## Quick build (recommended)

One command builds `Image.gz` and packs the flashable zip. `AnyKernel3/` is a submodule of the [miatoll fork](https://github.com/MinecAnton209/AnyKernel3) — clone with submodules:

```bash
git clone --recurse-submodules <this-repo>
# or, if already cloned:
git submodule update --init AnyKernel3

# normal build + flashable zip
./build_miatoll.sh

# NetHunter build (merges miatoll_nethunter.cfg first)
NETHUNTER=1 ./build_miatoll.sh

# custom names
./build_miatoll.sh vendor/xiaomi/miatoll_defconfig KernelSU_miatoll_test.zip
```

Result: `KernelSU_miatoll_<date>.zip` in the tree root — flash via TWRP/OFR.

`build_miatoll.sh` env overrides: `AK3_DIR`, `OUT_DIR`, `CLANG_DIR`, `JOBS`.

## Manual building

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

## Making a flashable zip (manual)

If you prefer the manual flow over `build_miatoll.sh`:

```bash
cp out/arch/arm64/boot/Image.gz AnyKernel3/Image.gz
cd AnyKernel3
zip -r9 ../miatoll-kernel-$(date +%F).zip * -x '.git*' README.md AnyKernel3.png
```

## Runtime knobs

After flashing (root required):

```bash
# bypass charging: game on cable without heating the battery
find /sys -name bypass_charging 2>/dev/null
echo 1 > <path>/bypass_charging   # on
echo 0 > <path>/bypass_charging   # off

# THP / governor / congestion control
cat /sys/kernel/mm/transparent_hugepage/enabled        # expect: always [madvise] never
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor  # expect: schedutil
cat /proc/sys/net/ipv4/tcp_available_congestion_control    # expect: cubic reno bbr
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
