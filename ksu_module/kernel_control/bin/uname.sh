#!/system/bin/sh
# The kernel version that apps see, for the WebUI and service.sh.
#   uname.sh get                                   key=value lines: the settings and the real release
#   uname.sh set ENABLED RELEASE VERSION SCOPE [PACKAGE...]
#                                                   validate, remember and apply; SCOPE is apps or selected
#   uname.sh apply                                  send the remembered settings to the kernel
#   uname.sh apps                                   installed third-party packages, one per line
# Only ordinary apps without su are ever shown the spoofed values: the kernel keeps root, the shell,
# system services and apps granted su on the real ones. SCOPE apps means every such app, selected
# only the listed packages.
# UNAME_CONF_DIR, UNAME_BIN, UNAME_PM and UNAME_REAL exist so the tests can run without a device.
. "$(cd "$(dirname "$0")/.." && pwd)/config.sh"
CONF_DIR=${UNAME_CONF_DIR:-$CONF_DIR}
BIN=${UNAME_BIN:-$(cd "$(dirname "$0")" && pwd)/ksu_susfs}
PM=${UNAME_PM:-pm}
SAVE_DIR="$CONF_DIR/uname"

MAX_LEN=64
MAX_APPS=64

# The kernel tells whether it has the scope command. An older one spoofs for every process,
# including system services, so nothing is sent to it.
supported() {
	"$BIN" show_features 2> /dev/null | grep -q '^uname_scope=1'
}

saved() {
	cat "$SAVE_DIR/$1" 2> /dev/null
}

NL='
'

valid_text() {
	text=$1
	[ -n "$text" ] || return 1
	# grep checks line by line, so a second line would slip through its character test.
	case "$text" in
	*"$NL"*) return 1 ;;
	esac
	[ "${#text}" -le "$MAX_LEN" ] || return 1
	[ "$text" != default ] || return 1
	# Printable ASCII only, which is all uname can sensibly show.
	printf '%s' "$text" | LC_ALL=C grep -q '[^ -~]' && return 1
	return 0
}

valid_package() {
	printf '%s' "$1" | grep -Eq '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'
}

get() {
	printf 'real=%s\n' "${UNAME_REAL:-$(uname -r)}"
	if supported; then
		echo supported=1
	else
		echo supported=0
	fi
	printf 'enabled=%s\n' "$(saved enabled)"
	printf 'release=%s\n' "$(saved release)"
	printf 'version=%s\n' "$(saved version)"
	printf 'scope=%s\n' "$(saved scope)"
	if [ -f "$SAVE_DIR/apps.txt" ]; then
		while IFS= read -r package; do
			[ -n "$package" ] && printf 'app=%s\n' "$package"
		done < "$SAVE_DIR/apps.txt"
	fi
	return 0
}

# App ids (the uid without the user part) of the remembered packages; names that are not
# installed are reported as "missing=" on stdout.
app_ids() {
	wanted=" $* "
	listing=$("$PM" list packages -U 2> /dev/null)
	printf '%s\n' "$listing" | awk -v wanted="$wanted" '
		/^package:/ {
			name = $1; sub(/^package:/, "", name)
			uid = $2; sub(/^uid:/, "", uid)
			if (index(wanted, " " name " ") > 0 && uid ~ /^[0-9]+$/) {
				print "id=" (uid % 100000)
				seen[name] = 1
			}
		}
		END {
			n = split(wanted, names, " ")
			for (i = 1; i <= n; i++) if (!(names[i] in seen)) print "missing=" names[i]
		}'
}

apply() {
	if ! supported; then
		echo "this kernel cannot limit the uname spoof to apps; update the kernel" >&2
		return 3
	fi

	if [ "$(saved enabled)" != 1 ]; then
		"$BIN" set_uname default default > /dev/null 2>&1 || return 4
		"$BIN" set_uname_scope apps > /dev/null 2>&1 || return 4
		return 0
	fi

	release=$(saved release)
	version=$(saved version)
	valid_text "$release" && valid_text "$version" || {
		echo "the saved kernel version is not valid" >&2
		return 2
	}
	"$BIN" set_uname "$release" "$version" > /dev/null 2>&1 || return 4

	if [ "$(saved scope)" = selected ]; then
		packages=$(cat "$SAVE_DIR/apps.txt" 2> /dev/null | tr '\n' ' ')
		# shellcheck disable=SC2086
		resolved=$(app_ids $packages)
		ids=$(printf '%s\n' "$resolved" | sed -n 's/^id=//p' | tr '\n' ' ')
		# shellcheck disable=SC2086
		"$BIN" set_uname_scope selected $ids > /dev/null 2>&1 || return 4
		printf '%s\n' "$resolved" | grep '^missing=' || true
	else
		"$BIN" set_uname_scope apps > /dev/null 2>&1 || return 4
	fi
	return 0
}

set_config() {
	enabled=$1
	release=$2
	version=$3
	scope=$4
	[ $# -ge 4 ] || {
		echo "usage: $0 set ENABLED RELEASE VERSION SCOPE [PACKAGE...]" >&2
		return 2
	}
	shift 4

	case "$enabled" in
	0 | 1) ;;
	*)
		echo "enabled must be 0 or 1" >&2
		return 2
		;;
	esac
	case "$scope" in
	apps | selected) ;;
	*)
		echo "scope must be apps or selected" >&2
		return 2
		;;
	esac
	valid_text "$release" || {
		echo "invalid release: use 1 to $MAX_LEN printable ASCII characters" >&2
		return 2
	}
	valid_text "$version" || {
		echo "invalid version: use 1 to $MAX_LEN printable ASCII characters" >&2
		return 2
	}
	if [ "$#" -gt "$MAX_APPS" ]; then
		echo "at most $MAX_APPS apps" >&2
		return 2
	fi
	for package in "$@"; do
		valid_package "$package" || {
			echo "invalid package name: $package" >&2
			return 2
		}
	done

	mkdir -p "$SAVE_DIR"
	printf '%s' "$enabled" > "$SAVE_DIR/enabled"
	printf '%s' "$release" > "$SAVE_DIR/release"
	printf '%s' "$version" > "$SAVE_DIR/version"
	printf '%s' "$scope" > "$SAVE_DIR/scope"
	: > "$SAVE_DIR/apps.txt"
	for package in "$@"; do
		grep -qx "$package" "$SAVE_DIR/apps.txt" || printf '%s\n' "$package" >> "$SAVE_DIR/apps.txt"
	done
	apply
}

apps() {
	"$PM" list packages -3 2> /dev/null | sed 's/^package://' | sort
}

case "$1" in
get)
	get
	;;
set)
	shift
	set_config "$@"
	;;
apply)
	apply
	;;
apps)
	apps
	;;
*)
	echo "usage: $0 get|set ENABLED RELEASE VERSION SCOPE [PACKAGE...]|apply|apps" >&2
	exit 1
	;;
esac
