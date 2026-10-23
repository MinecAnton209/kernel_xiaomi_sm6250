#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/config.sh"
BIN="$MODDIR/bin/ksu_susfs"

# SUS_PATH and log state live in kernel memory, so they are lost on every reboot.
# Wait for boot to finish before issuing them, otherwise the paths may not exist yet.
until [ "$(getprop sys.boot_completed)" = "1" ]; do
	sleep 1
done

[ -f "$CONF_DIR/log" ] && "$BIN" enable_log "$(cat "$CONF_DIR/log")"
[ -f "$CONF_DIR/sus_su" ] && "$BIN" sus_su "$(cat "$CONF_DIR/sus_su")"
# The version that apps see is kernel memory too. Boot has finished here, so pm can resolve the chosen apps.
[ -f "$CONF_DIR/uname/enabled" ] && "$MODDIR/bin/uname.sh" apply > /dev/null 2>&1

# The sysfs path depends on the device tree, so it is looked up once per boot and
# the WebUI reads it from here. An empty file means the kernel has no bypass_charging.
find /sys/devices -name bypass_charging 2>/dev/null | head -n 1 > "$CONF_DIR/bypass_path"
BYPASS_PATH=$(cat "$CONF_DIR/bypass_path")
# The SMB5 driver resets bypass_charging on every boot, so the saved state is written back here.
[ -n "$BYPASS_PATH" ] && [ "$(cat "$CONF_DIR/bypass" 2>/dev/null)" = "1" ] && printf '%s' 1 > "$BYPASS_PATH"

# The values the kernel booted with, before restore changes them; the Tuning tab's Reset returns to these.
"$MODDIR/bin/tune.sh" snapshot

# HACK: vendor post_boot scripts may set governors right after boot_completed and would
# overwrite the saved values, so tuning is restored after a short delay. It runs in the
# background so the SUSFS paths below are not held up by it.
(
	sleep 15
	"$MODDIR/bin/tune.sh" restore
) &

[ -f "$CONF_DIR/paths.txt" ] || exit 0
while IFS= read -r path; do
	[ -n "$path" ] && [ -e "$path" ] && "$BIN" add_sus_path "$path"
done < "$CONF_DIR/paths.txt"
