#!/bin/sh
# Runs bin/debug.sh with fake settings and checks what it prints. Usage: sh ksu_module/tests/shell/debug_test.sh
DEBUG_SH="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/debug.sh"
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

mkdir -p "$WORK/conf/spoof"
printf 'enabled=1\nscope=selected\napps=com.bank.app com.game.big\nmodel=POCO X3 NFC\nzygisk=1\nserial=SECRET123\n' > "$WORK/conf/spoof/config"
printf '1700000000\n' > "$WORK/conf/last_check"
printf 'release\n' > "$WORK/conf/update_channel"
printf 'renderer=Adreno (TM) 640\n' > "$WORK/conf/spoof/gl.conf"

run_report() {
	DEBUG_CONF_DIR="$WORK/conf" DEBUG_BIN=/nonexistent DEBUG_SPOOF=/nonexistent sh "$DEBUG_SH" 2>&1
}

report=$(run_report)
check 'the report exits with success' '0' "$?"
for section in module kernel spoof device state flash_log; do
	check "the report has the $section section" '1' "$(printf '%s\n' "$report" | grep -c "^== $section ==\$")"
done
check 'the settings the user chose are printed' '1' "$(printf '%s\n' "$report" | grep -c '^model=POCO X3 NFC$')"
check 'an unknown key in the settings is not printed' '0' "$(printf '%s\n' "$report" | grep -c 'SECRET123')"
check 'installed package names are never printed' '0' "$(printf '%s\n' "$report" | grep -c 'com.bank.app\|com.game.big')"
check 'the number of chosen apps is printed instead' 'apps=2' "$(printf '%s\n' "$report" | grep '^apps=')"
check 'the GL hook config is reported as present' 'gl_hook_config=present' "$(printf '%s\n' "$report" | grep '^gl_hook_config=')"
check 'the GL renderer value is not printed (only that the hook is configured)' '0' "$(printf '%s\n' "$report" | grep -c 'Adreno')"
check 'the update channel is printed' 'update_channel=release' "$(printf '%s\n' "$report" | grep '^update_channel=')"
check 'the last check time is printed' 'last_check=1700000000' "$(printf '%s\n' "$report" | grep '^last_check=')"

rm -rf "$WORK/conf/spoof"
report=$(run_report)
check 'a missing settings file is reported as absent' '1' "$(printf '%s\n' "$report" | grep -c '^config absent$')"
check 'a missing flash log is reported as absent' '1' "$(printf '%s\n' "$report" | grep -c '^absent$')"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
