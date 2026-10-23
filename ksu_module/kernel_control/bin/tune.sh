#!/system/bin/sh
# Kernel tunables shared by the WebUI and service.sh, so the key table lives in one place.
#   tune.sh keys              list supported keys
#   tune.sh get KEY           print the active value
#   tune.sh options KEY       print allowed values, or "range MIN MAX" for numbers
#   tune.sh dump              one tab separated line per key: key, active value, options
#   tune.sh set KEY VALUE     validate, write to the kernel and remember for the next boot
#   tune.sh restore           re-apply every remembered value
#   tune.sh snapshot          remember the active values as the defaults of this boot
#   tune.sh defaults          one tab separated line per remembered default: key, value
# TUNE_ROOT and TUNE_CONF_DIR exist so the tests can run against a fake sysfs tree.
. "$(cd "$(dirname "$0")/.." && pwd)/config.sh"
ROOT=${TUNE_ROOT:-}
CONF_DIR=${TUNE_CONF_DIR:-$CONF_DIR}
SAVE_DIR="$CONF_DIR/tune"
BOOT_DIR="$CONF_DIR/tune_boot"

KEYS="io_scheduler cpu_governor_little cpu_governor_big gpu_governor tcp_congestion thp swappiness"

CPUFREQ="$ROOT/sys/devices/system/cpu/cpufreq"

# KIND: bracket = one file lists every option with the active one in [brackets],
#       plain   = TARGETS holds the active value and OPTS lists the options,
#       int     = a number between MIN and MAX.
# TARGETS may be a glob; every match is written.
meta() {
	KIND=
	TARGETS=
	OPTS=
	MIN=
	MAX=
	case "$1" in
	io_scheduler)
		KIND=bracket
		TARGETS="$ROOT/sys/block/sd*/queue/scheduler"
		;;
	cpu_governor_little)
		KIND=plain
		TARGETS="$CPUFREQ/policy0/scaling_governor"
		OPTS="$CPUFREQ/policy0/scaling_available_governors"
		;;
	cpu_governor_big)
		KIND=plain
		TARGETS="$CPUFREQ/policy6/scaling_governor"
		OPTS="$CPUFREQ/policy6/scaling_available_governors"
		;;
	gpu_governor)
		KIND=plain
		TARGETS="$ROOT/sys/class/kgsl/kgsl-3d0/devfreq/governor"
		OPTS="$ROOT/sys/class/kgsl/kgsl-3d0/devfreq/available_governors"
		;;
	tcp_congestion)
		KIND=plain
		TARGETS="$ROOT/proc/sys/net/ipv4/tcp_congestion_control"
		OPTS="$ROOT/proc/sys/net/ipv4/tcp_available_congestion_control"
		;;
	thp)
		KIND=bracket
		TARGETS="$ROOT/sys/kernel/mm/transparent_hugepage/enabled"
		;;
	swappiness)
		KIND=int
		TARGETS="$ROOT/proc/sys/vm/swappiness"
		MIN=0
		MAX=100
		;;
	*)
		return 1
		;;
	esac
}

first_target() {
	for f in $TARGETS; do
		if [ -e "$f" ]; then
			printf '%s\n' "$f"
			return 0
		fi
	done
	return 1
}

unbracket() {
	v=${1#\[}
	printf '%s\n' "${v%\]}"
}

current() {
	f=$(first_target) || return 1
	if [ "$KIND" = bracket ]; then
		for w in $(cat "$f"); do
			case "$w" in
			\[*\])
				unbracket "$w"
				return 0
				;;
			esac
		done
		return 1
	fi
	read -r v < "$f"
	printf '%s\n' "$v"
}

options() {
	f=$(first_target) || return 1
	case "$KIND" in
	int)
		printf 'range %s %s\n' "$MIN" "$MAX"
		;;
	bracket)
		for w in $(cat "$f"); do
			unbracket "$w"
		done
		;;
	plain)
		[ -e "$OPTS" ] || return 1
		for w in $(cat "$OPTS"); do
			printf '%s\n' "$w"
		done
		;;
	esac
}

set_value() {
	key=$1
	val=$2
	if ! meta "$key"; then
		echo "unknown key: $key" >&2
		return 2
	fi
	if ! first_target > /dev/null; then
		echo "$key is not supported by this kernel" >&2
		return 3
	fi

	if [ "$KIND" = int ]; then
		case "$val" in
		'' | *[!0-9]*)
			echo "invalid number: $val" >&2
			return 4
			;;
		esac
		if [ "$val" -lt "$MIN" ] || [ "$val" -gt "$MAX" ]; then
			echo "out of range: $val" >&2
			return 4
		fi
	else
		ok=0
		for o in $(options); do
			[ "$o" = "$val" ] && ok=1
		done
		if [ "$ok" != 1 ]; then
			echo "unsupported value: $val" >&2
			return 4
		fi
	fi

	for f in $TARGETS; do
		[ -e "$f" ] || continue
		if ! printf '%s' "$val" > "$f"; then
			echo "write failed: $f" >&2
			return 5
		fi
	done

	mkdir -p "$SAVE_DIR"
	printf '%s' "$val" > "$SAVE_DIR/$key"
}

restore() {
	for key in $KEYS; do
		[ -f "$SAVE_DIR/$key" ] || continue
		read -r val < "$SAVE_DIR/$key"
		set_value "$key" "$val" 2> /dev/null
	done
	return 0
}

# Called by service.sh before restore, while the kernel still has the values it booted with;
# the WebUI's Reset button puts these back. A key the kernel lacks leaves no file.
snapshot() {
	mkdir -p "$BOOT_DIR"
	for key in $KEYS; do
		meta "$key" || continue
		cur=$(current 2> /dev/null) || continue
		[ -n "$cur" ] && printf '%s' "$cur" > "$BOOT_DIR/$key"
	done
	return 0
}

defaults() {
	for key in $KEYS; do
		[ -f "$BOOT_DIR/$key" ] || continue
		read -r val < "$BOOT_DIR/$key"
		printf '%s\t%s\n' "$key" "$val"
	done
	return 0
}

# The WebUI reads every key at once: one root shell instead of two per key keeps the
# Tuning tab from stalling while a dozen shells start. A key the kernel lacks gets
# empty fields.
dump() {
	for key in $KEYS; do
		meta "$key" || continue
		cur=$(current 2> /dev/null)
		opts=
		for o in $(options 2> /dev/null); do
			opts="${opts:+$opts }$o"
		done
		printf '%s\t%s\t%s\n' "$key" "$cur" "$opts"
	done
}

case "$1" in
keys)
	for key in $KEYS; do
		printf '%s\n' "$key"
	done
	;;
get)
	meta "$2" && current
	;;
options)
	meta "$2" && options
	;;
dump)
	dump
	;;
set)
	set_value "$2" "$3"
	;;
restore)
	restore
	;;
snapshot)
	snapshot
	;;
defaults)
	defaults
	;;
*)
	echo "usage: $0 keys|get KEY|options KEY|dump|set KEY VALUE|restore|snapshot|defaults" >&2
	exit 1
	;;
esac
