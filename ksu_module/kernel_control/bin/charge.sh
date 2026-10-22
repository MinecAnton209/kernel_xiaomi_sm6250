#!/system/bin/sh
# Charging diagnostics for the WebUI: prints key=value lines for every sysfs node the SMB5
# driver exposes, and silently skips the ones this kernel lacks.
#   charge.sh info
# CHARGE_ROOT exists so the tests can run against a fake sysfs tree.
ROOT=${CHARGE_ROOT:-}
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
		"batt_current:$BAT/current_now"; do
		key=${entry%%:*}
		path=${entry#*:}
		value=$(cat "$path" 2> /dev/null) || continue
		[ -n "$value" ] || continue
		printf '%s=%s\n' "$key" "$value"
	done
}

case "$1" in
info)
	info
	;;
*)
	echo "usage: $0 info" >&2
	exit 1
	;;
esac
