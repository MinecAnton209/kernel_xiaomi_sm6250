# TAS2562 debug tools

Minimal arm64 utilities without libc that talk to ALSA controls through ioctl on `/dev/snd/controlC0`.

- `tinymix` prints every control with its current value.
- `tinyset_on` sets `TAS25XX_DEBUG_ENABLE` to `TRUE`; `tinyset_off` sets it back to `FALSE`.

The debug flag is required for the `TAS25XX_GET_RE_LEFT` and `TAS25XX_GET_F0_LEFT` getters to return real values. Without it they read as zero.

## Build

```bash
./build.sh
```

By default the script uses clang from `../clang/bin`, relative to the repository root. Set `CLANG` to use a different compiler.

## Usage on the phone

```bash
adb push tinymix /data/local/tmp/
adb push tinyset_on /data/local/tmp/
adb push tinyset_off /data/local/tmp/
adb shell "su -c 'chmod 755 /data/local/tmp/tinymix /data/local/tmp/tinyset_on /data/local/tmp/tinyset_off'"
adb shell "su -c '/data/local/tmp/tinyset_on'"
adb shell "su -c '/data/local/tmp/tinymix'" > tinymix_debug_on.txt
adb shell "su -c '/data/local/tmp/tinyset_off'"
```

Set the flag while audio is playing, take the snapshot, then set it back to `FALSE`.

## Algorithm profile switching

- `tinyprof_music`, `tinyprof_voice`, `tinyprof_voip`, `tinyprof_ringtone` set `TAS25XX_ALGO_PROFILE` to the matching profile.
- Profile indices: `NONE` = 0, `MUSIC` = 1, `VOICE` = 2, `VOIP` = 3, `RINGTONE` = 4, `CALIB` = 5. Only the four tools above are built.
- Switch profiles while audio is playing through the loudspeaker. Always set `tinyprof_music` back when done.

```bash
adb push tinyprof_voice /data/local/tmp/
adb shell "su -c 'chmod 755 /data/local/tmp/tinyprof_voice && /data/local/tmp/tinyprof_voice'"
adb shell "su -c 'chmod 755 /data/local/tmp/tinyprof_music && /data/local/tmp/tinyprof_music'"
```
