#!/bin/sh
# Runs bin/tune.sh against a fake sysfs tree. Usage: sh ksu_module/tests/tune_test.sh
TUNE="$(cd "$(dirname "$0")/.." && pwd)/kernel_control/bin/tune.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

new_tree() {
	T="$WORK/$1"
	mkdir -p "$T/root" "$T/conf"
	R="$T/root"
	for dev in sda sdb sdc; do
		mkdir -p "$R/sys/block/$dev/queue"
		printf 'noop [deadline] cfq\n' > "$R/sys/block/$dev/queue/scheduler"
	done
	for p in policy0 policy6; do
		mkdir -p "$R/sys/devices/system/cpu/cpufreq/$p"
		printf 'schedutil\n' > "$R/sys/devices/system/cpu/cpufreq/$p/scaling_governor"
		printf 'performance powersave schedutil\n' > "$R/sys/devices/system/cpu/cpufreq/$p/scaling_available_governors"
	done
	mkdir -p "$R/sys/class/kgsl/kgsl-3d0/devfreq"
	printf 'msm-adreno-tz\n' > "$R/sys/class/kgsl/kgsl-3d0/devfreq/governor"
	printf 'msm-adreno-tz performance powersave\n' > "$R/sys/class/kgsl/kgsl-3d0/devfreq/available_governors"
	mkdir -p "$R/proc/sys/net/ipv4" "$R/proc/sys/vm"
	printf 'cubic\n' > "$R/proc/sys/net/ipv4/tcp_congestion_control"
	printf 'reno cubic bbr\n' > "$R/proc/sys/net/ipv4/tcp_available_congestion_control"
	printf '60\n' > "$R/proc/sys/vm/swappiness"
	mkdir -p "$R/sys/kernel/mm/transparent_hugepage"
	printf 'always [madvise] never\n' > "$R/sys/kernel/mm/transparent_hugepage/enabled"
}

tune() {
	TUNE_ROOT="$R" TUNE_CONF_DIR="$T/conf" sh "$TUNE" "$@"
}

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

check_fails() {
	name=$1
	shift
	if "$@" > /dev/null 2>&1; then
		FAIL=$((FAIL + 1))
		printf 'FAIL: %s (expected a non-zero exit)\n' "$name"
	else
		PASS=$((PASS + 1))
	fi
}

content() {
	read -r line < "$1"
	printf '%s' "$line"
}

new_tree keys
check 'lists every key' '7' "$(tune keys | wc -l | tr -d ' ')"

new_tree get
check 'bracket value is unwrapped (io)' 'deadline' "$(tune get io_scheduler)"
check 'bracket value is unwrapped (thp)' 'madvise' "$(tune get thp)"
check 'plain value (tcp)' 'cubic' "$(tune get tcp_congestion)"
check 'plain value (little cluster)' 'schedutil' "$(tune get cpu_governor_little)"
check 'plain value (gpu)' 'msm-adreno-tz' "$(tune get gpu_governor)"
check 'integer value' '60' "$(tune get swappiness)"

new_tree options
check 'bracket options drop the markers' 'noop deadline cfq' "$(tune options io_scheduler | tr '\n' ' ' | sed 's/ $//')"
check 'plain options come from the available file' 'reno cubic bbr' "$(tune options tcp_congestion | tr '\n' ' ' | sed 's/ $//')"
check 'integer options are a range' 'range 0 100' "$(tune options swappiness)"

new_tree set_list
tune set tcp_congestion bbr
check 'writes a plain value' 'bbr' "$(content "$R/proc/sys/net/ipv4/tcp_congestion_control")"
check 'remembers the value' 'bbr' "$(content "$T/conf/tune/tcp_congestion")"
tune set thp never
check 'writes a bracket value' 'never' "$(content "$R/sys/kernel/mm/transparent_hugepage/enabled")"

new_tree set_int
tune set swappiness 0
check 'integer lower bound' '0' "$(content "$R/proc/sys/vm/swappiness")"
tune set swappiness 100
check 'integer upper bound' '100' "$(content "$R/proc/sys/vm/swappiness")"

new_tree set_all_targets
tune set io_scheduler cfq
for dev in sda sdb sdc; do
	check "io scheduler written to $dev" 'cfq' "$(content "$R/sys/block/$dev/queue/scheduler")"
done

new_tree little_big_independent
tune set cpu_governor_big performance
check 'big cluster changes' 'performance' "$(content "$R/sys/devices/system/cpu/cpufreq/policy6/scaling_governor")"
check 'little cluster is untouched' 'schedutil' "$(content "$R/sys/devices/system/cpu/cpufreq/policy0/scaling_governor")"

new_tree rejects
check_fails 'unknown key' tune set nonsense 1
check_fails 'unsupported list value' tune set tcp_congestion vegas
check_fails 'empty value' tune set tcp_congestion ''
check_fails 'shell metacharacters in a value' tune set thp 'madvise; reboot'
check_fails 'integer above range' tune set swappiness 101
check_fails 'negative integer' tune set swappiness -1
check_fails 'non numeric integer' tune set swappiness abc
check_fails 'empty integer' tune set swappiness ''
check_fails 'get of unknown key' tune get nonsense
check 'rejected value leaves the kernel untouched' 'cubic' "$(content "$R/proc/sys/net/ipv4/tcp_congestion_control")"
check 'rejected value is not remembered' 'no' "$([ -e "$T/conf/tune/tcp_congestion" ] && echo yes || echo no)"

new_tree missing_node
rm -f "$R/proc/sys/net/ipv4/tcp_congestion_control"
check_fails 'set on a missing node' tune set tcp_congestion bbr
check 'get on a missing node prints nothing' '' "$(tune get tcp_congestion)"
check_fails 'get on a missing node exits non-zero' tune get tcp_congestion
check 'options on a missing node print nothing' '' "$(tune options tcp_congestion 2> /dev/null)"

new_tree missing_options
rm -f "$R/sys/class/kgsl/kgsl-3d0/devfreq/available_governors"
check_fails 'plain key without an options file refuses writes' tune set gpu_governor performance

new_tree restore
tune set tcp_congestion bbr
tune set swappiness 30
tune set thp never
printf 'cubic\n' > "$R/proc/sys/net/ipv4/tcp_congestion_control"
printf '60\n' > "$R/proc/sys/vm/swappiness"
printf 'always [madvise] never\n' > "$R/sys/kernel/mm/transparent_hugepage/enabled"
tune restore
check 'restore re-applies plain value' 'bbr' "$(content "$R/proc/sys/net/ipv4/tcp_congestion_control")"
check 'restore re-applies integer' '30' "$(content "$R/proc/sys/vm/swappiness")"
check 'restore re-applies bracket value' 'never' "$(content "$R/sys/kernel/mm/transparent_hugepage/enabled")"

new_tree restore_empty
check 'restore with nothing saved succeeds' '0' "$(tune restore > /dev/null 2>&1; echo $?)"

new_tree restore_tolerates_failures
tune set tcp_congestion bbr
tune set swappiness 30
printf 'vegas\n' > "$T/conf/tune/tcp_congestion"
printf '60\n' > "$R/proc/sys/vm/swappiness"
check 'restore skips a stale value and exits 0' '0' "$(tune restore > /dev/null 2>&1; echo $?)"
check 'restore still applies the remaining keys' '30' "$(content "$R/proc/sys/vm/swappiness")"

new_tree dump
out=$(tune dump)
check 'dump prints one line per key' '7' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
check 'dump line for a bracket list' "$(printf 'io_scheduler\tdeadline\tnoop deadline cfq')" "$(printf '%s\n' "$out" | grep '^io_scheduler')"
check 'dump line for a plain list' "$(printf 'tcp_congestion\tcubic\treno cubic bbr')" "$(printf '%s\n' "$out" | grep '^tcp_congestion')"
check 'dump line for THP' "$(printf 'thp\tmadvise\talways madvise never')" "$(printf '%s\n' "$out" | grep '^thp')"
check 'dump line for an integer' "$(printf 'swappiness\t60\trange 0 100')" "$(printf '%s\n' "$out" | grep '^swappiness')"
for key in $(tune keys); do
	line=$(printf '%s\n' "$out" | grep "^$key	")
	current=$(printf '%s\n' "$line" | cut -f2)
	check "dump value for $key matches get" "$(tune get "$key")" "$current"
	options=$(printf '%s\n' "$line" | cut -f3)
	check "dump options for $key match options" "$(tune options "$key" | tr '\n' ' ' | tr -s ' ' | sed 's/ $//')" "$options"
done

new_tree dump_missing
rm -f "$R/proc/sys/net/ipv4/tcp_congestion_control"
out=$(tune dump)
check 'dump keeps a key the kernel lacks, with empty fields' "$(printf 'tcp_congestion\t\t')" "$(printf '%s\n' "$out" | grep '^tcp_congestion')"
check 'dump still prints every key when one is missing' '7' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
check 'dump exits zero when a key is missing' '0' "$(tune dump > /dev/null 2>&1; echo $?)"

new_tree dump_empty
rm -rf "$R/sys" "$R/proc"
out=$(tune dump)
check 'dump on a kernel with no tunables still lists every key' '7' "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
check 'dump on a kernel with no tunables has no values' '0' "$(printf '%s\n' "$out" | cut -f2,3 | tr -d '\t' | grep -c .)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
