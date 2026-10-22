#!/system/bin/sh
# Live battery and charging state for the WebUI, in one call so a refresh starts a single
# root shell. Prints key=value lines for every sysfs node the SMB5 driver exposes, plus the
# bypass charging switch, and silently skips whatever this kernel lacks.
#   charge.sh info
# CHARGE_ROOT and CHARGE_CONF_DIR exist so the tests can run against a fake tree.
. "$(cd "$(dirname "$0")/.." && pwd)/config.sh"
ROOT=${CHARGE_ROOT:-}
CONF_DIR=${CHARGE_CONF_DIR:-$CONF_DIR}
BAT="$ROOT/sys/class/power_supply/battery"
USB="$ROOT/sys/class/power_supply/usb"

info() {
	for entry in \
		"usb_real_type:$USB/real_type" \
		"usb_pd_active:$USB/pd_active" \
		"usb_input_limit:$USB/input_current_settled" \
		"usb_voltage:$USB/voltage_now" \
		"batt_fcc_max:$BAT/constant_charge_current_max" \
		"batt_thermal_level:$BAT/system_temp_level" \
		"batt_charge_type:$BAT/charge_type" \
		"batt_charger_temp:$BAT/charger_temp" \
		"batt_voltage:$BAT/voltage_now" \
		"batt_current:$BAT/current_now" \
		"batt_status:$BAT/status" \
		"batt_capacity:$BAT/capacity" \
		"batt_temp:$BAT/temp"; do
		key=${entry%%:*}
		path=${entry#*:}
		value=$(cat "$path" 2> /dev/null) || continue
		[ -n "$value" ] || continue
		printf '%s=%s\n' "$key" "$value"
	done
}

# service.sh stores where the kernel put bypass_charging; without that file there is no switch.
bypass() {
	path=$(cat "$CONF_DIR/bypass_path" 2> /dev/null)
	[ -n "$path" ] || return 0
	printf 'bypass_path=%s\n' "$path"
	value=$(cat "$ROOT$path" 2> /dev/null) || return 0
	[ -n "$value" ] && printf 'bypass=%s\n' "$value"
	return 0
}

case "$1" in
info)
	info
	bypass
	;;
*)
	echo "usage: $0 info" >&2
	exit 1
	;;
esac
