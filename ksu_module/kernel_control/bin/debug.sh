#!/system/bin/sh
# Prints a report for a bug report: the module, the kernel, the device identity settings and the last
# flash log. Nothing personal is printed: no serial number, no account, no list of installed apps and no
# list of the apps chosen for spoofing, only their count. Usage: debug.sh
# DEBUG_CONF_DIR, DEBUG_BIN and DEBUG_SPOOF let the tests point it at fake files.
MODDIR=$(cd "$(dirname "$0")/.." && pwd)
. "$MODDIR/config.sh"
CONF_DIR=${DEBUG_CONF_DIR:-$CONF_DIR}
BIN=${DEBUG_BIN:-$MODDIR/bin/ksu_susfs}
SPOOF=${DEBUG_SPOOF:-$MODDIR/bin/spoof.sh}
SPOOF_CONF="$CONF_DIR/spoof"

section() {
	printf '== %s ==\n' "$1"
}

# A value is printed as "key=value"; a missing file prints "absent" so the report still says what is missing.
show_file() {
	if [ -f "$1" ]; then
		cat "$1"
	else
		echo absent
	fi
}

section module
grep -E '^(id|version|versionCode|build)=' "$MODDIR/module.prop" 2> /dev/null || echo "module.prop missing"

section kernel
uname -r
for command in show_version show_variant show_build show_features; do
	printf '%s:\n' "$command"
	"$BIN" "$command" 2> /dev/null || echo "unavailable"
done

section spoof
if [ -f "$SPOOF_CONF/config" ]; then
	# Only the keys the settings define are printed, so nothing else that ends up in the file leaks.
	# The package names are the user's choice, so only their count is printed.
	grep -E '^(enabled|scope|props|zygisk|profile|brand|manufacturer|model|device|product|board|hardware|soc_manufacturer|soc_model|cpu_[a-z_]+|gpu_[a-z_]+|gl_[a-z]+|soc_[a-z]+|mem_total_kb|dt_[a-z]+)=' "$SPOOF_CONF/config"
	printf 'apps=%s\n' "$(grep -m1 '^apps=' "$SPOOF_CONF/config" 2> /dev/null | cut -d= -f2- | wc -w | tr -d ' ')"
else
	echo "config absent"
fi
printf 'gl_hook_config=%s\n' "$( [ -f "$SPOOF_CONF/gl.conf" ] && echo present || echo absent )"
printf 'zygisk_payload=%s\n' "$( [ -f "$MODDIR/zygisk/arm64-v8a.so" ] && echo present || echo absent )"
printf 'kernel_interface=%s\n' "$( [ -d /sys/kernel/device_spoof ] && echo present || echo absent )"

section device
for property in ro.product.brand ro.product.model ro.product.device ro.product.name ro.board.platform ro.hardware ro.build.version.release ro.build.fingerprint; do
	printf '%s=%s\n' "$property" "$(getprop "$property" 2> /dev/null)"
done

section state
printf 'update_channel=%s\n' "$(show_file "$CONF_DIR/update_channel" | head -n 1)"
printf 'last_check=%s\n' "$(show_file "$CONF_DIR/last_check" | head -n 1)"
printf 'module_build=%s\n' "$(show_file "$CONF_DIR/module_build" | head -n 1)"

section flash_log
if [ -f /data/local/tmp/kernel_control_flash.log ]; then
	tail -n 40 /data/local/tmp/kernel_control_flash.log
else
	echo absent
fi
