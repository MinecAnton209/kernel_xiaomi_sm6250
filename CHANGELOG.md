# Changelog

All notable changes to this kernel tree are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for release tags (`vX.Y.Z`).

## [Unreleased]

### Added

- DualSense Edge support in `hid-playstation`: device bind for `0x0df2`,
  Fn1/Fn2 buttons and rear paddles (`BTN_TRIGGER_HAPPY1-4`), Edge-aware
  gamepad creation.
- DualSense vibration v2 via firmware feature version handshake.
- DualSense headset jack detection (`SW_HEADPHONE_INSERT`) with
  headphone/speaker audio routing and safe workqueue lifecycle.
- DualSense LED exposure via plain `led_classdev` (RGB lightbar,
  player 1-5, mic mute) plus RW `player_id` sysfs.
- `FUTEX_WAIT_MULTIPLE` (opcode 31) backport in `kernel/futex.c` so
  Wine/Proton fsync reports up and running instead of eventfd fallback.
- `bypass_charging` sysfs toggle on the SMB5 charger: system runs off
  USB input while the battery idles (no heat cycling on cable).
- `miatoll_nethunter.cfg` fragment: USB Wi-Fi with monitor/inject
  (ATH9K_HTC, RT2x00, RTL8xxxU, RTW88), USB serial, HIDRAW, Ethernet
  dongles, QMI_WWAN. Merged via `merge_config.sh`.
- `build_miatoll.sh`: one-command `Image.gz` build plus flashable
  AnyKernel3 zip; `NETHUNTER=1`, `SKIP_BUILD=1`, `IMAGE=...` modes.
- AnyKernel3 submodule (MinecAnton209 fork) with staged installer:
  banner/version files, 5-phase progress bar, bypass_charging tip.
- This changelog (`CHANGELOG.md`).

### Changed

- Default CPUFreq governor `performance` -> `schedutil` (with WALT/EAS).
- Default I/O scheduler `cfq` -> `deadline`; dropped `CFQ_GROUP_IOSCHED`.
- THP enabled in `madvise` mode (opt-in via `MADV_HUGEPAGE`).
- BBR congestion control + FQ scheduler enabled (default stays CUBIC).
- Conntrack protocol helpers (FTP/TFTP/IRC/H323/Amanda/NetBIOS/PPTP/
  SANE) and the EVENTS notifier dropped for cooler tethering.
- External USB Wi-Fi drivers moved out of the base defconfig into the
  NetHunter fragment; base stays lean for daily use.
- `WQ_POWER_EFFICIENT_DEFAULT=y`, smaller log buffer (1 MB -> 256 KB).
- Default flashable-zip name `KernelSU_miatoll_*` -> `miatoll_*`
  (no KernelSU in this tree).
- README refreshed: submodule clone flow, feature list, runtime knobs.

### Removed

- Debug overhead: `DEBUG_INFO`, `SCHEDSTATS`, `CMA_DEBUG`,
  `IOMMU_DEBUG`/`TRACKING`/`TESTS`, `MMC_PERF_PROFILING`,
  `KALLSYMS_ALL`, `IKHEADERS`.

### Fixed

- `mm`: two stale 2-arg `try_to_unmap()` calls updated for the
  3-arg rmap API (exposed by enabling THP).
- `futex`: key accounting on wait-multiple setup failure (no leaks,
  no double-put), single on-stack timer init across retries,
  `CLOCK_REALTIME` allowed with `FUTEX_WAIT_MULTIPLE`.
- `bypass_charging`: vote rollback on partial failure, NULL votable
  guards, `smb_lock` scope narrowed (votes run unlocked), dedicated
  store serialization mutex.

## [0.1.0] - 2026-09-30

### Added

- Base 4.14.336 tree for `sm6250` / `miatoll` with defconfig sync.
- `CONFIG_CGROUP_BPF` boot fix.
- PlayStation + Steam HID drivers enabled (`SONY_FF` included).
- USB Wi-Fi injection modules and monitor-mode packet injection
  (`qcacld-3.0`, `mac80211`), RTL8188eus support, rtw88 802.11ac
  subtree backport.
- README with build instructions, `scripts/config` toggle note.
