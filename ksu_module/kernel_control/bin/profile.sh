#!/system/bin/sh
# Performance profiles: a named set of CPU and GPU governors applied through tune.sh, so each value
# is written to the kernel now and remembered for the next boot. Other tunables are left alone.
#   profile.sh list           print the profile names
#   profile.sh current        print the profile that was applied last, or "default"
#   profile.sh apply NAME     write the governors of NAME; fails if a governor is not supported
# PROFILE_CONF_DIR and TUNE_CONF_DIR (and TUNE_ROOT for tune.sh) exist so the tests can run
# against fake trees.
MODDIR=$(cd "$(dirname "$0")/.." && pwd)
. "$MODDIR/config.sh"
TUNE="$MODDIR/bin/tune.sh"
PROFILE_CONF_DIR=${PROFILE_CONF_DIR:-$CONF_DIR}
BOOT_DIR="${TUNE_CONF_DIR:-$CONF_DIR}/tune_boot"

PROFILES="default performance battery"
GOVERNORS="cpu_governor_little cpu_governor_big gpu_governor"

# default restores what the kernel booted with; the other profiles set one fixed governor everywhere.
value_for() {
	case "$1" in
	performance) printf 'performance' ;;
	battery) printf 'powersave' ;;
	default)
		[ -f "$BOOT_DIR/$2" ] && cat "$BOOT_DIR/$2"
		;;
	esac
}

known() {
	for name in $PROFILES; do
		[ "$name" = "$1" ] && return 0
	done
	return 1
}

apply() {
	if ! known "$1"; then
		echo "unknown profile: $1" >&2
		return 2
	fi
	status=0
	for key in $GOVERNORS; do
		value=$(value_for "$1" "$key")
		[ -n "$value" ] || continue
		if ! sh "$TUNE" set "$key" "$value" > /dev/null 2>&1; then
			echo "not supported here: $key=$value" >&2
			status=1
		fi
	done
	if [ "$status" = 0 ]; then
		mkdir -p "$PROFILE_CONF_DIR"
		printf '%s' "$1" > "$PROFILE_CONF_DIR/profile"
	fi
	return "$status"
}

current() {
	value=$(cat "$PROFILE_CONF_DIR/profile" 2> /dev/null)
	printf '%s\n' "${value:-default}"
}

case "$1" in
list)
	for name in $PROFILES; do
		printf '%s\n' "$name"
	done
	;;
current)
	current
	;;
apply)
	apply "$2"
	;;
*)
	echo "usage: $0 list|current|apply NAME" >&2
	exit 1
	;;
esac
