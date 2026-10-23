#!/bin/sh
# Runs the host build of kc_logger against a fake sysfs tree. Usage: sh ksu_module/tests/shell/logger_test.sh
# The first run downloads and builds SQLite through logger/build.sh; later runs reuse the build.
MODULE="$(cd "$(dirname "$0")/../.." && pwd)"
LOGGER="$MODULE/logger/build/kc_logger.host"
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

if [ ! -x "$LOGGER" ]; then
	sh "$MODULE/logger/build.sh" host > "$WORK/build.log" 2>&1 || {
		echo "logger: could not build the host binary, see logger/build/host.log"
		exit 1
	}
fi

new_tree() {
	R="$WORK/$1"
	mkdir -p "$R/sys/class/thermal/thermal_zone0" "$R/sys/class/thermal/thermal_zone1"
	mkdir -p "$R/sys/devices/system/cpu/cpu0/cpufreq" "$R/sys/devices/system/cpu/cpu7/cpufreq"
	mkdir -p "$R/sys/class/kgsl/kgsl-3d0" "$R/sys/class/power_supply/battery" "$R/proc"
	printf 'cpu0-silver-usr\n' > "$R/sys/class/thermal/thermal_zone0/type"
	printf '41000\n' > "$R/sys/class/thermal/thermal_zone0/temp"
	printf 'gpuss-0-usr\n' > "$R/sys/class/thermal/thermal_zone1/type"
	printf '39500\n' > "$R/sys/class/thermal/thermal_zone1/temp"
	printf '1804800\n' > "$R/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"
	printf '2208000\n' > "$R/sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq"
	printf '600000000\n' > "$R/sys/class/kgsl/kgsl-3d0/gpuclk"
	printf '318\n' > "$R/sys/class/power_supply/battery/temp"
	printf 'MemTotal:        5731008 kB\nMemAvailable:    2891000 kB\n' > "$R/proc/meminfo"
}

# Runs the logger with the fake tree as its sysfs root.
logger() {
	KC_ROOT="$R" "$LOGGER" "$@"
}

# Adds a row with an old timestamp, the way a logger from days ago would have written it.
add_old_row() {
	python3 -c 'import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1])
con.execute("INSERT INTO samples(ts, cpu_temp) VALUES (?, ?)", (int(time.time()) - int(sys.argv[2]) * 86400, 40.0))
con.commit()' "$1" "$2"
}

new_tree full
DB="$WORK/full.db"
logger sample "$DB"
check 'one sample writes one row' 'rows=1' "$(logger stats "$DB" | cut -d' ' -f1)"
check 'the CPU temperature is the hottest CPU zone in degrees' '41.0' "$(logger dump "$DB" | cut -d'|' -f2)"
check 'the GPU temperature is the GPU zone in degrees' '39.5' "$(logger dump "$DB" | cut -d'|' -f3)"
check 'RAM and other temperatures are empty when the kernel has no such zone' '' "$(logger dump "$DB" | cut -d'|' -f4,5 | tr -d '|')"
check 'the battery temperature comes from tenths of a degree' '31.8' "$(logger dump "$DB" | cut -d'|' -f6)"
check 'the CPU clock is the fastest core in MHz' '2208' "$(logger dump "$DB" | cut -d'|' -f7)"
check 'the GPU clock is in MHz' '600' "$(logger dump "$DB" | cut -d'|' -f8)"
check 'available memory is in MB' '2823' "$(logger dump "$DB" | cut -d'|' -f9)"

logger sample "$DB"
check 'every sample adds a row' 'rows=2' "$(logger stats "$DB" | cut -d' ' -f1)"

check 'a database with rows takes space' '1' "$(logger stats "$DB" | sed 's/.*bytes=//' | awk '{print ($1 > 0) ? 1 : 0}')"

new_tree empty
rm -rf "$R/sys" "$R/proc"
mkdir -p "$R"
EMPTY_DB="$WORK/empty.db"
logger sample "$EMPTY_DB"
check 'a kernel with no sensors still gets a row with empty fields' '|||||||' "$(logger dump "$EMPTY_DB" | cut -d'|' -f2- | tr -cd '|')"

new_tree prune
DB="$WORK/prune.db"
logger sample "$DB"
add_old_row "$DB" 10
add_old_row "$DB" 9
check 'the rows exist before pruning' 'rows=3' "$(logger stats "$DB" | cut -d' ' -f1)"
logger prune "$DB" 7
check 'pruning removes rows older than the retention' 'rows=1' "$(logger stats "$DB" | cut -d' ' -f1)"
check 'pruning keeps the recent sample' '1' "$(logger dump "$DB" | wc -l | tr -d ' ')"

new_tree series
DB="$WORK/series.db"
logger sample "$DB"
logger sample "$DB"
python3 -c 'import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1])
con.execute("INSERT INTO samples(ts, cpu_temp) VALUES (?, ?)", (int(time.time()) - 2 * 86400, 99.0))
con.commit()' "$DB"
check 'series returns one line per bucket with samples' '1' "$(logger series "$DB" 3600 4 | wc -l | tr -d ' ' | awk '{print ($1 >= 1) ? 1 : 0}')"
check 'series averages the recent CPU temperature' '1' "$(logger series "$DB" 3600 4 | grep -c '|41.0|')"
check 'series leaves out samples older than the range' '0' "$(logger series "$DB" 3600 4 | grep -c '99.0')"
check 'series prints the bucket time and six values per line' '7' "$(logger series "$DB" 3600 4 | head -n 1 | tr -cd '|' | wc -c | awk '{print $1 + 1}')"
check 'series rejects a number of points of zero' '1' "$(logger series "$DB" 3600 0 > /dev/null 2>&1; echo $?)"
check 'series rejects a range above a year' '1' "$(logger series "$DB" 40000000 10 > /dev/null 2>&1; echo $?)"

new_tree clear
DB="$WORK/clear.db"
logger sample "$DB"
logger sample "$DB"
logger clear "$DB"
check 'clear removes every row' 'rows=0' "$(logger stats "$DB" | cut -d' ' -f1)"

check 'run rejects an interval of zero' '1' "$(logger run "$WORK/bad.db" 0 7 > /dev/null 2>&1; echo $?)"
check 'run rejects an interval that is not a number' '1' "$(logger run "$WORK/bad.db" abc 7 > /dev/null 2>&1; echo $?)"
check 'run rejects a retention of zero days' '1' "$(logger run "$WORK/bad.db" 60 0 > /dev/null 2>&1; echo $?)"
check 'prune rejects a retention above a year' '1' "$(logger prune "$WORK/bad.db" 400 > /dev/null 2>&1; echo $?)"
check 'no command fails' '1' "$(logger > /dev/null 2>&1; echo $?)"
check 'unknown command fails' '1' "$(logger bogus "$WORK/bad.db" > /dev/null 2>&1; echo $?)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
