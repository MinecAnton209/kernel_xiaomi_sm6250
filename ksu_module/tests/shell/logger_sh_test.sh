#!/bin/sh
# Runs bin/logger.sh with the host build of kc_logger and a fake sysfs tree. Usage: sh ksu_module/tests/shell/logger_sh_test.sh
MODULE="$(cd "$(dirname "$0")/../.." && pwd)"
LOGGER_SH="$MODULE/kernel_control/bin/logger.sh"
LOGGER_HOST="$MODULE/logger/build/kc_logger.host"
WORK=$(mktemp -d)

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

if [ ! -x "$LOGGER_HOST" ]; then
	sh "$MODULE/logger/build.sh" host > "$WORK/build.log" 2>&1 || {
		echo "logger.sh: could not build the host binary, see logger/build/host.log"
		exit 1
	}
fi

R="$WORK/tree"
mkdir -p "$R/sys/class/thermal/thermal_zone0" "$R/proc"
printf 'cpu0-silver-usr\n' > "$R/sys/class/thermal/thermal_zone0/type"
printf '41000\n' > "$R/sys/class/thermal/thermal_zone0/temp"
printf 'MemTotal: 5731008 kB\nMemAvailable: 2891000 kB\n' > "$R/proc/meminfo"

export KC_ROOT="$R"
export LOGGER_CONF_DIR="$WORK/conf"
export LOGGER_BIN="$LOGGER_HOST"
trap 'sh "$LOGGER_SH" stop; rm -rf "$WORK"' EXIT

sh "$LOGGER_SH" configure 0 60 7
check 'a disabled logger reports disabled and not running' 'enabled=0
interval=60
retention_days=7
running=0' "$(sh "$LOGGER_SH" status | sed -n '1,4p' | tr -d '\r' | paste -sd '\n' -)"

sh "$LOGGER_SH" configure 1 60 7
sleep 1
check 'an enabled logger starts and writes its first sample' 'running=1' "$(sh "$LOGGER_SH" status | grep '^running=')"
check 'the running logger has written a row' '1' "$(sh "$LOGGER_SH" status | grep -c '^rows=[1-9]')"

sh "$LOGGER_SH" stop
sleep 1
check 'stop ends the logger' 'running=0' "$(sh "$LOGGER_SH" status | grep '^running=')"

sh "$LOGGER_SH" configure 1 5 3
check 'the settings are saved to the configuration folder' '5 3' "$(cat "$LOGGER_CONF_DIR/interval") $(cat "$LOGGER_CONF_DIR/retention_days")"
check 'a new interval and retention are reported' '5 3' "$(sh "$LOGGER_SH" status | grep -E '^(interval|retention_days)=' | cut -d= -f2 | paste -sd ' ' -)"
sh "$LOGGER_SH" stop

check 'an interval other than 5 or 60 is rejected' '2' "$(sh "$LOGGER_SH" configure 1 10 7 > /dev/null 2>&1; echo $?)"
check 'an enabled flag other than 0 or 1 is rejected' '2' "$(sh "$LOGGER_SH" configure 2 60 7 > /dev/null 2>&1; echo $?)"
check 'zero retention days is rejected' '2' "$(sh "$LOGGER_SH" configure 1 60 0 > /dev/null 2>&1; echo $?)"
check 'retention above a year is rejected' '2' "$(sh "$LOGGER_SH" configure 1 60 366 > /dev/null 2>&1; echo $?)"
check 'retention that is not a number is rejected' '2' "$(sh "$LOGGER_SH" configure 1 60 abc > /dev/null 2>&1; echo $?)"
check 'a rejected setting leaves the saved interval alone' '5' "$(cat "$LOGGER_CONF_DIR/interval")"

sh "$LOGGER_SH" configure 1 60 7 > /dev/null
sleep 1
sh "$LOGGER_SH" clear
check 'clear removes the history' 'rows=0' "$(sh "$LOGGER_SH" status | grep '^rows=' | cut -d' ' -f1)"
sh "$LOGGER_SH" stop

check 'no command fails' '1' "$(sh "$LOGGER_SH" > /dev/null 2>&1; echo $?)"
check 'unknown command fails' '1' "$(sh "$LOGGER_SH" bogus > /dev/null 2>&1; echo $?)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
