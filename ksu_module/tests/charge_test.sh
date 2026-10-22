#!/bin/sh
# Runs bin/charge.sh against a fake sysfs tree. Usage: sh ksu_module/tests/charge_test.sh
CHARGE="$(cd "$(dirname "$0")/.." && pwd)/kernel_control/bin/charge.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

check() {
	name=$1
	expected=$2
	actual=$3
	if [ "$expected" = "$actual" ]; then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
		printf 'FAIL: %s\n  expected: [%s]\n  actual:   [%s]\n' "$name" "$expected" "$actual"
	fi
}

new_tree() {
	R="$WORK/$1"
	mkdir -p "$R/sys/class/power_supply/battery" "$R/sys/class/power_supply/usb"
	B="$R/sys/class/power_supply/battery"
	U="$R/sys/class/power_supply/usb"
	printf 'USB_PD\n' > "$U/real_type"
	printf '1\n' > "$U/pd_active"
	printf '2000000\n' > "$U/input_current_settled"
	printf '9012000\n' > "$U/voltage_now"
	printf '3500000\n' > "$B/constant_charge_current_max"
	printf '3\n' > "$B/system_temp_level"
	printf 'Fast\n' > "$B/charge_type"
	printf '412\n' > "$B/charger_temp"
	printf '4210000\n' > "$B/voltage_now"
	printf -- '-3100000\n' > "$B/current_now"
}

info() {
	CHARGE_ROOT="$R" sh "$CHARGE" info
}

new_tree full
out=$(info)
check 'reports usb charger type' 'usb_real_type=USB_PD' "$(printf '%s\n' "$out" | grep '^usb_real_type=')"
check 'reports pd state' 'usb_pd_active=1' "$(printf '%s\n' "$out" | grep '^usb_pd_active=')"
check 'reports input limit' 'usb_input_limit=2000000' "$(printf '%s\n' "$out" | grep '^usb_input_limit=')"
check 'reports usb voltage' 'usb_voltage=9012000' "$(printf '%s\n' "$out" | grep '^usb_voltage=')"
check 'reports battery current limit' 'batt_fcc_max=3500000' "$(printf '%s\n' "$out" | grep '^batt_fcc_max=')"
check 'reports thermal level' 'batt_thermal_level=3' "$(printf '%s\n' "$out" | grep '^batt_thermal_level=')"
check 'reports charge type' 'batt_charge_type=Fast' "$(printf '%s\n' "$out" | grep '^batt_charge_type=')"
check 'reports charger temperature' 'batt_charger_temp=412' "$(printf '%s\n' "$out" | grep '^batt_charger_temp=')"
check 'reports battery voltage' 'batt_voltage=4210000' "$(printf '%s\n' "$out" | grep '^batt_voltage=')"
check 'keeps the sign of the battery current' 'batt_current=-3100000' "$(printf '%s\n' "$out" | grep '^batt_current=')"
check 'prints exactly one line per node' '10' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"

new_tree missing_node
rm -f "$B/system_temp_level" "$U/pd_active"
out=$(info)
check 'skips missing nodes' '8' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
check 'missing thermal level is absent' '0' "$(printf '%s\n' "$out" | grep -c '^batt_thermal_level=')"
check 'present nodes are still reported' 'usb_real_type=USB_PD' "$(printf '%s\n' "$out" | grep '^usb_real_type=')"

new_tree empty_node
: > "$B/charge_type"
out=$(info)
check 'skips an empty node' '0' "$(printf '%s\n' "$out" | grep -c '^batt_charge_type=')"

new_tree no_usb
rm -rf "$U"
out=$(info)
check 'works without a usb supply' '6' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
check 'exit status is zero without a usb supply' '0' "$(CHARGE_ROOT="$R" sh "$CHARGE" info > /dev/null 2>&1; echo $?)"

R="$WORK/nothing"
mkdir -p "$R"
check 'prints nothing when the kernel has no supplies' '' "$(info)"
check 'exit status is zero when the kernel has no supplies' '0' "$(CHARGE_ROOT="$R" sh "$CHARGE" info > /dev/null 2>&1; echo $?)"

check 'unknown command fails' '1' "$(sh "$CHARGE" bogus > /dev/null 2>&1; echo $?)"
check 'no command fails' '1' "$(sh "$CHARGE" > /dev/null 2>&1; echo $?)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
