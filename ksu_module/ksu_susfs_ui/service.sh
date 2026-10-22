#!/system/bin/sh
MODDIR=${0%/*}
CONF_DIR=/data/adb/susfs_ui
BIN="$MODDIR/bin/ksu_susfs"

# SUS_PATH and log state live in kernel memory, so they are lost on every reboot.
# Wait for boot to finish before issuing them, otherwise the paths may not exist yet.
until [ "$(getprop sys.boot_completed)" = "1" ]; do
	sleep 1
done

[ -f "$CONF_DIR/log" ] && "$BIN" enable_log "$(cat "$CONF_DIR/log")"
[ -f "$CONF_DIR/sus_su" ] && "$BIN" sus_su "$(cat "$CONF_DIR/sus_su")"

# The sysfs path depends on the device tree, so it is looked up once per boot and
# the WebUI reads it from here. An empty file means the kernel has no bypass_charging.
find /sys/devices -name bypass_charging 2>/dev/null | head -n 1 > "$CONF_DIR/bypass_path"
BYPASS_PATH=$(cat "$CONF_DIR/bypass_path")
# The SMB5 driver resets bypass_charging on every boot, so the saved state is written back here.
[ -n "$BYPASS_PATH" ] && [ "$(cat "$CONF_DIR/bypass" 2>/dev/null)" = "1" ] && printf '%s' 1 > "$BYPASS_PATH"

[ -f "$CONF_DIR/paths.txt" ] || exit 0
while IFS= read -r path; do
	[ -n "$path" ] && [ -e "$path" ] && "$BIN" add_sus_path "$path"
done < "$CONF_DIR/paths.txt"
