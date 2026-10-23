#!/bin/sh
# Runs bin/sensors.sh against a fake sysfs and proc tree. Usage: sh ksu_module/tests/shell/sensors_test.sh
SENSORS="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/sensors.sh"
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
	printf '950000000\n' > "$R/sys/class/kgsl/kgsl-3d0/max_gpuclk"
	printf '318\n' > "$R/sys/class/power_supply/battery/temp"
	printf 'MemTotal:        5731008 kB\nMemFree:          412000 kB\nMemAvailable:    2891000 kB\n' > "$R/proc/meminfo"
}

info() {
	SENSORS_ROOT="$R" sh "$SENSORS" info
}

new_tree full
check 'prints every thermal zone as type and milli degrees' '2' "$(info | grep -c '^thermal=')"
check 'thermal zone line keeps the type and the temperature' 'thermal=cpu0-silver-usr|41000' "$(info | grep '^thermal=cpu0')"
check 'prints each online CPU frequency in kHz' '2' "$(info | grep -c '^cpu_freq=')"
check 'CPU frequency line carries the core number' 'cpu_freq=7|2208000' "$(info | grep '^cpu_freq=7')"
check 'prints the GPU clock in Hz' 'gpu_freq=600000000' "$(info | grep '^gpu_freq=')"
check 'prints the GPU maximum clock in Hz' 'gpu_max_freq=950000000' "$(info | grep '^gpu_max_freq=')"
check 'prints total memory in kB' 'mem_total_kb=5731008' "$(info | grep '^mem_total_kb=')"
check 'prints available memory in kB' 'mem_avail_kb=2891000' "$(info | grep '^mem_avail_kb=')"
check 'prints the battery temperature in tenths of a degree' 'battery_temp=318' "$(info | grep '^battery_temp=')"

new_tree partial
rm -rf "$R/sys/class/kgsl"
rm -f "$R/sys/class/thermal/thermal_zone1/temp"
check 'skips a thermal zone that has no temperature' '1' "$(info | grep -c '^thermal=')"
check 'skips the GPU clocks when the kernel has no kgsl node' '0' "$(info | grep -c '^gpu_')"
check 'keeps the rest when one node is missing' '1' "$(info | grep -c '^mem_total_kb=')"

new_tree nothing
rm -rf "$R/sys" "$R/proc"
mkdir -p "$R"
check 'prints nothing when the kernel exposes none of the nodes' '' "$(info)"
check 'exit status is zero when the kernel exposes none of the nodes' '0' "$(SENSORS_ROOT="$R" sh "$SENSORS" info > /dev/null 2>&1; echo $?)"

check 'unknown command fails' '1' "$(sh "$SENSORS" bogus > /dev/null 2>&1; echo $?)"
check 'no command fails' '1' "$(sh "$SENSORS" > /dev/null 2>&1; echo $?)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
