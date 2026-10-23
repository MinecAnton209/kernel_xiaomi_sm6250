#!/bin/sh
# Runs bin/profile.sh against a fake sysfs tree. Usage: sh ksu_module/tests/shell/profile_test.sh
PROFILE="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/profile.sh"
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
	CPUFREQ="$R/sys/devices/system/cpu/cpufreq"
	mkdir -p "$CPUFREQ/policy0" "$CPUFREQ/policy6" "$R/sys/class/kgsl/kgsl-3d0/devfreq" "$R/conf/tune_boot"
	printf 'schedutil\n' > "$CPUFREQ/policy0/scaling_governor"
	printf 'performance powersave schedutil\n' > "$CPUFREQ/policy0/scaling_available_governors"
	printf 'schedutil\n' > "$CPUFREQ/policy6/scaling_governor"
	printf 'performance powersave schedutil\n' > "$CPUFREQ/policy6/scaling_available_governors"
	printf 'msm-adreno-tz\n' > "$R/sys/class/kgsl/kgsl-3d0/devfreq/governor"
	printf 'msm-adreno-tz performance powersave\n' > "$R/sys/class/kgsl/kgsl-3d0/devfreq/available_governors"
	printf 'schedutil\n' > "$R/conf/tune_boot/cpu_governor_little"
	printf 'schedutil\n' > "$R/conf/tune_boot/cpu_governor_big"
	printf 'msm-adreno-tz\n' > "$R/conf/tune_boot/gpu_governor"
}

run() {
	TUNE_ROOT="$R" TUNE_CONF_DIR="$R/conf" PROFILE_CONF_DIR="$R/conf" sh "$PROFILE" "$@"
}

new_tree a
check 'lists the profiles in order' 'default
performance
battery' "$(run list)"
check 'reports the default profile before anything is applied' 'default' "$(run current)"

run apply performance > /dev/null 2>&1
check 'performance sets the little cluster governor' 'performance' "$(cat "$CPUFREQ/policy0/scaling_governor")"
check 'performance sets the big cluster governor' 'performance' "$(cat "$CPUFREQ/policy6/scaling_governor")"
check 'performance sets the GPU governor' 'performance' "$(cat "$R/sys/class/kgsl/kgsl-3d0/devfreq/governor")"
check 'performance is remembered as the current profile' 'performance' "$(run current)"
check 'performance is remembered for the next boot' 'performance' "$(cat "$R/conf/tune/cpu_governor_big")"

run apply battery > /dev/null 2>&1
check 'battery sets the governors to powersave' 'powersave' "$(cat "$CPUFREQ/policy6/scaling_governor")"
check 'battery is remembered as the current profile' 'battery' "$(run current)"

run apply default > /dev/null 2>&1
check 'default restores the boot governor of the little cluster' 'schedutil' "$(cat "$CPUFREQ/policy0/scaling_governor")"
check 'default restores the boot GPU governor' 'msm-adreno-tz' "$(cat "$R/sys/class/kgsl/kgsl-3d0/devfreq/governor")"
check 'default is remembered as the current profile' 'default' "$(run current)"

check 'an unknown profile fails' '2' "$(run apply turbo > /dev/null 2>&1; echo $?)"
check 'an unknown profile does not change the current profile' 'default' "$(run current)"

new_tree b
printf 'msm-adreno-tz powersave\n' > "$R/sys/class/kgsl/kgsl-3d0/devfreq/available_governors"
check 'a profile fails when the GPU does not support its governor' '1' "$(run apply performance > /dev/null 2>&1; echo $?)"
check 'the CPU governors are still written when the GPU one is missing' 'performance' "$(cat "$CPUFREQ/policy0/scaling_governor")"
check 'a failed profile is not remembered' 'default' "$(run current)"

new_tree c
rm -f "$R/conf/tune_boot/gpu_governor"
check 'default with no boot snapshot succeeds and leaves the GPU governor alone' '0' "$(run apply default > /dev/null 2>&1; echo $?)"
check 'default with no boot snapshot keeps the GPU governor' 'msm-adreno-tz' "$(cat "$R/sys/class/kgsl/kgsl-3d0/devfreq/governor")"

check 'no command fails' '1' "$(run > /dev/null 2>&1; echo $?)"
check 'unknown command fails' '1' "$(run bogus > /dev/null 2>&1; echo $?)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
