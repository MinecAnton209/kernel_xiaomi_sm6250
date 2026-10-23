#!/system/bin/sh
# Background history of temperatures, clocks and memory, written by kc_logger into SQLite.
#   logger.sh configure ENABLED INTERVAL RETENTION_DAYS   save the settings and restart the logger
#   logger.sh start                                       start it if the settings enable it
#   logger.sh stop                                        stop it
#   logger.sh status                                      print the settings, whether it runs, and the size
#   logger.sh clear                                       delete the history
# INTERVAL is 5 or 60 seconds; RETENTION_DAYS is 1 to 365. LOGGER_CONF_DIR and LOGGER_BIN exist so the
# tests can use a fake directory and the host build of kc_logger.
MODDIR=$(cd "$(dirname "$0")/.." && pwd)
. "$MODDIR/config.sh"
LOGGER_CONF_DIR=${LOGGER_CONF_DIR:-$CONF_DIR/logger}
LOGGER_BIN=${LOGGER_BIN:-$MODDIR/bin/kc_logger}
DB="$LOGGER_CONF_DIR/history.db"

pid_file() {
	printf '%s/pid' "$LOGGER_CONF_DIR"
}

running_pid() {
	pid=$(cat "$(pid_file)" 2> /dev/null) || return 1
	[ -n "$pid" ] && kill -0 "$pid" 2> /dev/null || return 1
	printf '%s\n' "$pid"
}

stop() {
	if pid=$(running_pid); then
		kill "$pid" 2> /dev/null
	fi
	rm -f "$(pid_file)"
	return 0
}

start() {
	stop
	[ "$(cat "$LOGGER_CONF_DIR/enabled" 2> /dev/null)" = "1" ] || return 0
	interval=$(cat "$LOGGER_CONF_DIR/interval" 2> /dev/null)
	days=$(cat "$LOGGER_CONF_DIR/retention_days" 2> /dev/null)
	"$LOGGER_BIN" run "$DB" "$interval" "$days" > /dev/null 2>&1 &
	printf '%s\n' "$!" > "$(pid_file)"
	return 0
}

configure() {
	enabled=$1
	interval=$2
	days=$3
	case "$enabled" in
	0 | 1) ;;
	*)
		echo "invalid enabled flag: $enabled" >&2
		return 2
		;;
	esac
	case "$interval" in
	5 | 60) ;;
	*)
		echo "invalid interval: $interval" >&2
		return 2
		;;
	esac
	case "$days" in
	'' | *[!0-9]*)
		echo "invalid retention: $days" >&2
		return 2
		;;
	esac
	if [ "$days" -lt 1 ] || [ "$days" -gt 365 ]; then
		echo "invalid retention: $days" >&2
		return 2
	fi

	mkdir -p "$LOGGER_CONF_DIR"
	printf '%s' "$enabled" > "$LOGGER_CONF_DIR/enabled"
	printf '%s' "$interval" > "$LOGGER_CONF_DIR/interval"
	printf '%s' "$days" > "$LOGGER_CONF_DIR/retention_days"
	start
}

status() {
	printf 'enabled=%s\n' "$(cat "$LOGGER_CONF_DIR/enabled" 2> /dev/null || echo 0)"
	printf 'interval=%s\n' "$(cat "$LOGGER_CONF_DIR/interval" 2> /dev/null || echo 60)"
	printf 'retention_days=%s\n' "$(cat "$LOGGER_CONF_DIR/retention_days" 2> /dev/null || echo 7)"
	if running_pid > /dev/null; then
		echo 'running=1'
	else
		echo 'running=0'
	fi
	[ -f "$DB" ] && "$LOGGER_BIN" stats "$DB" 2> /dev/null | tr ' ' '\n'
	return 0
}

clear_history() {
	[ -f "$DB" ] || return 0
	"$LOGGER_BIN" clear "$DB"
}

case "$1" in
configure)
	configure "$2" "$3" "$4"
	;;
start)
	start
	;;
stop)
	stop
	;;
status)
	status
	;;
clear)
	clear_history
	;;
*)
	echo "usage: $0 configure ENABLED INTERVAL RETENTION_DAYS|start|stop|status|clear" >&2
	exit 1
	;;
esac
