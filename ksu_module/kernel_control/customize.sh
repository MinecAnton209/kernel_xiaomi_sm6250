. "$MODPATH/config.sh"
OLD_MODULE_DIR="$MODULES_DIR/$OLD_MODULE_ID"

ui_print "- Creating Kernel Control config in $CONF_DIR"
mkdir -p "$CONF_DIR"

if [ -d "$OLD_CONF_DIR" ] && [ ! -f "$CONF_DIR/paths.txt" ]; then
	ui_print "- Migrating settings from $OLD_CONF_DIR"
	cp -a "$OLD_CONF_DIR/." "$CONF_DIR/"
fi
[ -f "$CONF_DIR/paths.txt" ] || : > "$CONF_DIR/paths.txt"

# Both modules would run their service.sh and fight over the same settings.
if [ -d "$OLD_MODULE_DIR" ]; then
	ui_print "- Old SUSFS Control module will be removed on reboot"
	touch "$OLD_MODULE_DIR/remove"
fi

set_perm "$MODPATH/bin/ksu_susfs" 0 0 0755
set_perm "$MODPATH/bin/tune.sh" 0 0 0755
set_perm "$MODPATH/bin/charge.sh" 0 0 0755
set_perm "$MODPATH/bin/uname.sh" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
