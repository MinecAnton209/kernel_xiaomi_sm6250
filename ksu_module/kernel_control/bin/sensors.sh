#!/system/bin/sh
# Live temperatures, CPU and GPU clocks and memory for the Status tab, in one call so a refresh
# starts a single root shell. Prints key=value lines and silently skips whatever this kernel lacks.
#   sensors.sh info
# SENSORS_ROOT exists so the tests can run against a fake tree.
. "$(cd "$(dirname "$0")/.." && pwd)/config.sh"
ROOT=${SENSORS_ROOT:-}

thermal() {
	for zone in "$ROOT"/sys/class/thermal/thermal_zone*; do
		[ -d "$zone" ] || continue
		type=$(cat "$zone/type" 2> /dev/null) || continue
		temp=$(cat "$zone/temp" 2> /dev/null) || continue
		[ -n "$type" ] && [ -n "$temp" ] || continue
		printf 'thermal=%s|%s\n' "$type" "$temp"
	done
}

cpu() {
	for core in "$ROOT"/sys/devices/system/cpu/cpu[0-9]*; do
		[ -d "$core" ] || continue
		freq=$(cat "$core/cpufreq/scaling_cur_freq" 2> /dev/null) || continue
		[ -n "$freq" ] || continue
		printf 'cpu_freq=%s|%s\n' "${core##*/cpu}" "$freq"
		max=$(cat "$core/cpufreq/cpuinfo_max_freq" 2> /dev/null)
		[ -n "$max" ] && printf 'cpu_max=%s|%s\n' "${core##*/cpu}" "$max"
	done
}

gpu() {
	KGSL="$ROOT/sys/class/kgsl/kgsl-3d0"
	value=$(cat "$KGSL/gpuclk" 2> /dev/null) && [ -n "$value" ] && printf 'gpu_freq=%s\n' "$value"
	value=$(cat "$KGSL/max_gpuclk" 2> /dev/null) && [ -n "$value" ] && printf 'gpu_max_freq=%s\n' "$value"
	return 0
}

memory() {
	[ -r "$ROOT/proc/meminfo" ] || return 0
	while read -r name value _; do
		case "$name" in
		MemTotal:) printf 'mem_total_kb=%s\n' "$value" ;;
		MemAvailable:) printf 'mem_avail_kb=%s\n' "$value" ;;
		esac
	done < "$ROOT/proc/meminfo"
	return 0
}

battery() {
	value=$(cat "$ROOT/sys/class/power_supply/battery/temp" 2> /dev/null) && [ -n "$value" ] && printf 'battery_temp=%s\n' "$value"
	return 0
}

case "$1" in
info)
	thermal
	cpu
	gpu
	memory
	battery
	;;
*)
	echo "usage: $0 info" >&2
	exit 1
	;;
esac
