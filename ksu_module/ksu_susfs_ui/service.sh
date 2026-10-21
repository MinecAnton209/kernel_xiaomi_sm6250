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

[ -f "$CONF_DIR/paths.txt" ] || exit 0
while IFS= read -r path; do
	[ -n "$path" ] && [ -e "$path" ] && "$BIN" add_sus_path "$path"
done < "$CONF_DIR/paths.txt"
