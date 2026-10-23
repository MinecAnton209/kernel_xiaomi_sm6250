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
- New: root support through KernelSU-Next (legacy branch, kprobe hook
  mode), added as the `KernelSU-Next` submodule and enabled with
  `CONFIG_KSU` in miatoll_defconfig.
- New: SUSFS v1.5.5 for KernelSU-Next, written from scratch for this
  tree: sus_path, sus_mount, sus_kstat, try_umount, spoof_uname,
  open_redirect, log toggle and the status commands (version, variant,
  enabled features).
- try_umount runs on app spawn in addition to the manual trigger, and
  post-fs-data reads the `/data/adb/susfs_*` marker files.
- sus_su (`CONFIG_KSU_SUSFS_SUS_SU`, enabled in miatoll_defconfig):
  root through a randomly named character device, switched at runtime.
- `ksu_susfs` client (`tools/susfs`) for sending SUSFS commands from
  the device shell, including `sus_su`, `show_sus_su_working_mode` and
  `is_sus_su_ready`.
- Kernel Control KernelSU module (`ksu_module/kernel_control`, v1.1.0):
  WebUI with Status, Paths, System, Tuning and SU tabs in a bottom navbar.
  Hidden paths, log setting and sus_su mode are restored on every boot.
- Kernel Control: bypass charging switch with live battery readout, and a
  Tuning tab for I/O scheduler, CPU and GPU governors, TCP congestion
  control, THP and swappiness, restored after every boot.
- Kernel Control: the Tuning tab reads every setting with one root shell
  (`tune.sh dump`) and caches the result until the WebUI page is closed,
  which stops it from stalling on open. A `?` button opens a help page that
  explains each setting and its values.
- Kernel Control: M3E skeletons stand in for content that fills in after the
  data arrives: the Status chips and features, the hidden paths list, the
  battery and charging chips, the SU status, the Tuning rows (instead of a
  spinner) and the update notes on the first check. They have the size of the
  real content, so nothing jumps when it appears, use the cheaper pulse
  animation, and are only built for a tab opened before its background load
  finished. The card is marked `aria-busy` meanwhile.
- Kernel Control: the Tuning settings with a list of values (scheduler,
  governor and the like) use the M3E select in an outlined form field instead
  of the native dropdown. Settings with a numeric range keep a number input.
- Kernel Control: the loading indicator of the update check is no longer
  squeezed by its flex row (it shrank from 38 to 32 px on a phone and its
  round container cut the corners off the shapes); the spinner and the check
  button now wrap together, and the pull indicator got an `aria-label`.
- Kernel Control: every command now runs through `ksu.spawn`, which returns
  at once and reports from a background thread. `ksu.exec` is synchronous in
  the manager and held the page's JS thread for as long as each root shell
  took, which made animations stutter. A probe command decides between the
  two on first use, so a manager without `spawn` falls back to `exec`.
- Kernel Control: fewer lags. Every page now loads with one root shell
  (`charge.sh info` also reports the battery and the bypass switch), all
  pages are prefetched in the background after the first paint and refreshed
  quietly once the tab animation has ended, and the pull to refresh
  indicator is no longer left animating while hidden. The status feature
  chips update in place too.
- Kernel Control: the kernel download and module update panel uses the M3E
  linear progress indicator in its wavy variant: query while connecting,
  buffer while downloading (the main bar is the slowest of the parallel
  parts, the buffer is everything received) and indeterminate while
  verifying and installing. `fetch.sh` now also reports the size of each part.
- Kernel Control: pull to refresh on every tab with the M3E loading
  indicator (needs @m3e/web 2.10.2), an M3E loading indicator for the
  update check and for the Tuning tab, and settings that load in the
  background when the WebUI opens. Charging chips now update in place
  instead of replaying their entrance animation every refresh.
- Kernel Control: Charging card on the System tab with the charger type,
  PD state, input limit, battery current limit, thermal level, charger
  temperature and charging power, refreshed every 2 s. It shows what
  limits a given charger, since the kernel already ships a high-charging
  profile for joyeuse.
- The module was renamed from SUSFS Control: id `ksu_susfs_ui` ->
  `kernel_control`, config `/data/adb/susfs_ui` -> `/data/adb/kernel_control`.
  Installing it migrates the old settings and marks the old module for
  removal on reboot.
- ThinLTO in miatoll_defconfig.
- CI: separate `module` job builds the WebUI and packages the module.
- CI: `[skip kernel]` / `[skip kernel build]` and `[skip module]` /
  `[skip module build]` in a commit message skip that build. The rolling
  Unreleased pre-release is still updated with the build that ran: the other
  build's files stay in the release and `manifest.json` lists both
  (`ci/prerelease-assets.sh`). Tags and pull requests always build everything.

### Changed

- Default CPUFreq governor `performance` -> `schedutil` (with WALT/EAS).
- Default I/O scheduler `cfq` -> `deadline`; dropped `CFQ_GROUP_IOSCHED`.
- THP enabled in `madvise` mode (opt-in via `MADV_HUGEPAGE`).
- BBR congestion control + FQ scheduler enabled (default stays CUBIC).
- External USB Wi-Fi drivers moved out of the base defconfig into the
  NetHunter fragment; base stays lean for daily use.
- `WQ_POWER_EFFICIENT_DEFAULT=y`, smaller log buffer (1 MB -> 256 KB).
- Default flashable-zip name `KernelSU_miatoll_*` -> `miatoll_*`
  (no KernelSU in this tree).
- README refreshed: submodule clone flow, feature list, runtime knobs.
- CFI and SCS disabled in miatoll_defconfig for Magisk and APatch.
- Conntrack helpers restored for Wi-Fi hotspot; TTL/HL targets enabled
  for tethering.
- `build_miatoll.sh` links host tools with the system linker and puts
  `CLANG_DIR` on `PATH` for the LLVM binutils.

### Removed

- Debug overhead: `DEBUG_INFO`, `SCHEDSTATS`, `CMA_DEBUG`,
  `IOMMU_DEBUG`/`TRACKING`/`TESTS`, `MMC_PERF_PROFILING`,
  `KALLSYMS_ALL`, `IKHEADERS`.

### Fixed

- `arm64/sm6250`: missing includes and sysfs build fix.
- `mm`: two stale 2-arg `try_to_unmap()` calls updated for the
  3-arg rmap API (exposed by enabling THP).
- `futex`: key accounting on wait-multiple setup failure (no leaks,
  no double-put), single on-stack timer init across retries,
  `CLOCK_REALTIME` allowed with `FUTEX_WAIT_MULTIPLE`.
- `bypass_charging`: vote rollback on partial failure, NULL votable
  guards, `smb_lock` scope narrowed (votes run unlocked), dedicated
  store serialization mutex.
- SUSFS sus_path had no effect on app processes: the
  `TASK_STRUCT_NON_ROOT_USER_APP_PROC` flag is now set in the setresuid
  hook.
- Host tools failed to link with the LLVM linker (`.relr.dyn`).

## [0.1.0] - 2026-09-30

### Added

- Base 4.14.336 tree for `sm6250` / `miatoll` with defconfig sync.
- `CONFIG_CGROUP_BPF` boot fix.
- PlayStation + Steam HID drivers enabled (`SONY_FF` included).
- USB Wi-Fi injection modules and monitor-mode packet injection
  (`qcacld-3.0`, `mac80211`), RTL8188eus support, rtw88 802.11ac
  subtree backport.
- README with build instructions, `scripts/config` toggle note.
