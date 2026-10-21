CONF_DIR=/data/adb/susfs_ui

ui_print "- Creating SUSFS UI config in $CONF_DIR"
mkdir -p "$CONF_DIR"
[ -f "$CONF_DIR/paths.txt" ] || : > "$CONF_DIR/paths.txt"

set_perm "$MODPATH/bin/ksu_susfs" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
