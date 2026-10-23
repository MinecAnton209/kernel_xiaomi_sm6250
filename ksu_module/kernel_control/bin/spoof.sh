#!/system/bin/sh
# Saves the device identity and sends it to the kernel, the property area and the Zygisk
# payload. Usage:
#   spoof.sh get
#   spoof.sh set PAYLOAD       newline-separated key=value lines
#   spoof.sh apply             re-send the saved settings
#   spoof.sh reset             clear the kernel settings and the saved identity
#   spoof.sh apps              installed third-party packages, one per line
# The tests override the paths below through the SPOOF_* environment variables.
. "$(cd "$(dirname "$0")/.." && pwd)/config.sh"
SPOOF_CONF_DIR=${SPOOF_CONF_DIR:-$CONF_DIR}
SPOOF_DIR="$SPOOF_CONF_DIR/spoof"
SYSFS=${SPOOF_SYSFS:-/sys/kernel/device_spoof}
ZYGISK_DIR=${SPOOF_ZYGISK_DIR:-$ZYGISK_DIR}
PM=${SPOOF_PM:-pm}
CPUINFO=${SPOOF_CPUINFO:-/proc/cpuinfo}
MEMINFO=${SPOOF_MEMINFO:-/proc/meminfo}
GPU_MODEL=${SPOOF_GPU_MODEL:-/sys/class/kgsl/kgsl-3d0/gpu_model}
SOC_DIR=${SPOOF_SOC_DIR:-/sys/devices/soc0}

CONFIG="$SPOOF_DIR/config"
PROPS_FILE="$SPOOF_DIR/props.txt"
GL_FILE="$SPOOF_DIR/gl.conf"
PROPS_TMP=

KERNEL_KEYS="cpu_hardware cpu_processor cpu_model_name cpu_implementer cpu_architecture cpu_variant cpu_part cpu_revision cpu_max_freqs gpu_model gpu_max_clk soc_machine soc_family soc_id soc_revision mem_total_kb dt_model dt_compatible"
CONFIG_KEYS="enabled profile scope apps props zygisk brand manufacturer model device product board hardware soc_manufacturer soc_model cpu_hardware cpu_processor cpu_model_name cpu_implementer cpu_architecture cpu_variant cpu_part cpu_revision cpu_max_freqs gpu_model gpu_max_clk gl_renderer gl_vendor soc_machine soc_family soc_id soc_revision mem_total_kb dt_model dt_compatible"

cfg() {
	[ -f "$CONFIG" ] || return 0
	line=$(grep -m1 "^$1=" "$CONFIG" 2> /dev/null) || return 0
	printf '%s' "${line#*=}"
}

supported() {
	[ -d "$SYSFS" ]
}

zygisk_installed() {
	[ -d "$ZYGISK_DIR" ] && [ ! -f "$ZYGISK_DIR/disable" ]
}

# The longest text each field takes. The kernel buffers in include/linux/devspoof.h hold one byte
# less than their size, since the NUL is kept; the WebUI uses the same numbers, so they must match.
text_limit() {
	case "$1" in
	brand | manufacturer | device | board | soc_manufacturer | soc_model)
		echo 32
		;;
	cpu_hardware | cpu_processor | cpu_model_name | gpu_model | soc_machine | soc_family | soc_id | soc_revision)
		echo 63
		;;
	dt_model)
		echo 127
		;;
	dt_compatible)
		echo 255
		;;
	gl_renderer)
		echo 128
		;;
	*)
		echo 64
		;;
	esac
}

valid_text() {
	[ -n "$1" ] || return 1
	[ "${#1}" -le "$2" ] || return 1
	case "$1" in
	default | -) return 1 ;;
	esac
	printf '%s' "$1" | LC_ALL=C grep -q '[^ -~]' && return 1
	return 0
}

valid_u32() {
	printf '%s' "$1" | grep -Eq '^(0[xX][0-9A-Fa-f]+|[0-9]+)$'
}

valid_u64() {
	printf '%s' "$1" | grep -Eq '^[0-9]+$'
}

valid_freqs() {
	count=0
	for freq in $(printf '%s' "$1" | tr ',' ' '); do
		valid_u32 "$freq" || return 1
		count=$((count + 1))
		[ "$count" -le 16 ] || return 1
	done
	[ "$count" -gt 0 ]
}

valid_package() {
	printf '%s' "$1" | grep -Eq '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'
}

valid_apps() {
	count=0
	for package in $(printf '%s' "$1" | tr ',' ' '); do
		valid_package "$package" || return 1
		count=$((count + 1))
		[ "$count" -le 64 ] || return 1
	done
	return 0
}

valid_key() {
	case " $CONFIG_KEYS " in
	*" $1 "*) return 0 ;;
	esac
	return 1
}

write_kernel() {
	if [ -n "$2" ]; then
		printf '%s\n' "$2" > "$SYSFS/$1" 2> /dev/null
	else
		printf 'default\n' > "$SYSFS/$1" 2> /dev/null
	fi
}

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

resetprop_path() {
	if [ -n "$SPOOF_RESETPROP" ]; then
		printf '%s' "$SPOOF_RESETPROP"
		return 0
	fi
	if command -v resetprop > /dev/null 2>&1; then
		command -v resetprop
		return 0
	fi
	[ -x "$KSU_BIN_DIR/resetprop" ] && printf '%s' "$KSU_BIN_DIR/resetprop"
	return 0
}

add_prop() {
	value=$(cfg "$2")
	[ -n "$value" ] && printf '%s=%s\n' "$1" "$value" >> "$PROPS_TMP"
}

write_props() {
	PROPS_TMP="$PROPS_FILE.tmp.$$"
	: > "$PROPS_TMP" || return 1
	add_prop ro.product.brand brand
	add_prop ro.product.manufacturer manufacturer
	add_prop ro.product.model model
	add_prop ro.product.device device
	add_prop ro.product.name product
	add_prop ro.product.board board
	add_prop ro.board.platform board
	add_prop ro.hardware hardware
	add_prop ro.soc.manufacturer soc_manufacturer
	add_prop ro.soc.model soc_model
	mv "$PROPS_TMP" "$PROPS_FILE"
}

apply_props_now() {
	resetprop=$(resetprop_path)
	if [ -z "$resetprop" ]; then
		echo "resetprop not found; properties will be applied on the next boot" >&2
		return 0
	fi
	while IFS= read -r line; do
		key=${line%%=*}
		value=${line#*=}
		[ -n "$key" ] || continue
		"$resetprop" -n "$key" "$value" 2> /dev/null || true
	done < "$PROPS_FILE"
	return 0
}

# The Zygisk hook reads this file in a root companion. It exists only while the hook has something to
# change, so a disabled module or a missing NeoZygisk leaves the apps untouched.
write_gl() {
	if [ "$enabled" = 1 ] && [ "$(cfg zygisk)" = 1 ] && [ -n "$(cfg gl_renderer)" ] && zygisk_installed; then
		{
			printf 'enabled=1\n'
			printf 'scope=%s\n' "$scope"
			printf 'renderer=%s\n' "$(cfg gl_renderer)"
			printf 'apps=%s\n' "$(cfg apps)"
		} > "$GL_FILE" || return 1
	else
		rm -f "$GL_FILE"
	fi
}

apply() {
	if ! supported; then
		echo "this kernel has no /sys/kernel/device_spoof; update the kernel" >&2
		return 3
	fi

	enabled=$(cfg enabled)
	[ "$enabled" = 1 ] || enabled=0
	scope=$(cfg scope)
	case "$scope" in
	apps | all | root | selected) ;;
	*) scope=apps ;;
	esac

	# A refused write must not leave the kernel switched off while the saved settings say on, so
	# every write is attempted and the switch is set to match the settings in any case.
	printf '0\n' > "$SYSFS/enabled" 2> /dev/null || return 4
	failed=0
	for key in $KERNEL_KEYS; do
		write_kernel "$key" "$(cfg "$key")" || {
			echo "the kernel refused $key" >&2
			failed=1
		}
	done

	if [ "$scope" = selected ]; then
		resolved=$(app_ids $(cfg apps))
		ids=$(printf '%s\n' "$resolved" | sed -n 's/^id=//p' | tr '\n' ' ' | sed 's/ $//')
		if [ -z "$ids" ]; then
			ids=default
		fi
		printf '%s\n' "$ids" > "$SYSFS/uids" 2> /dev/null || failed=1
		printf '%s\n' "$resolved" | grep '^missing=' || true
	else
		printf 'default\n' > "$SYSFS/uids" 2> /dev/null || failed=1
	fi
	printf '%s\n' "$scope" > "$SYSFS/scope" 2> /dev/null || failed=1
	printf '%s\n' "$enabled" > "$SYSFS/enabled" 2> /dev/null || failed=1

	if [ "$enabled" = 1 ] && [ "$(cfg props)" = 1 ]; then
		write_props || return 4
		apply_props_now
	else
		rm -f "$PROPS_FILE"
	fi
	write_gl || failed=1
	[ "$failed" = 0 ] || return 4
	return 0
}

set_config() {
	[ $# -ge 1 ] || {
		echo "usage: $0 set PAYLOAD" >&2
		return 2
	}
	payload=$1
	mkdir -p "$SPOOF_DIR" || return 4
	payload_file="$SPOOF_DIR/payload.$$"
	tmp="$CONFIG.tmp.$$"
	printf '%s\n' "$payload" > "$payload_file" || return 4
	: > "$tmp" || return 4

	while IFS= read -r line || [ -n "$line" ]; do
		line=$(printf '%s' "$line" | tr -d '\r')
		case "$line" in
		'') continue ;;
		'#'*) continue ;;
		esac
		case "$line" in
		*=*) ;;
		*)
			echo "not a key=value line: $line" >&2
			rm -f "$payload_file" "$tmp"
			return 2
			;;
		esac
		key=${line%%=*}
		value=${line#*=}
		valid_key "$key" || {
			echo "unknown setting: $key" >&2
			rm -f "$payload_file" "$tmp"
			return 2
		}
		case "$key" in
		enabled | props | zygisk)
			case "$value" in
			'' | 0 | 1) ;;
			*)
				echo "$key must be 0 or 1" >&2
				rm -f "$payload_file" "$tmp"
				return 2
				;;
			esac
			;;
		scope)
			case "$value" in
			'' | apps | all | root | selected) ;;
			*)
				echo "scope must be apps, all, root or selected" >&2
				rm -f "$payload_file" "$tmp"
				return 2
				;;
			esac
			;;
		apps)
			value=$(printf '%s' "$value" | tr ',' ' ' | tr -s ' ' | sed 's/^ //; s/ $//')
			valid_apps "$value" || {
				echo "invalid package list" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			}
			;;
		profile)
			if [ -n "$value" ] && ! valid_text "$value" 32; then
				echo "invalid profile name" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			fi
			;;
		cpu_max_freqs)
			if [ -n "$value" ] && ! valid_freqs "$value"; then
				echo "cpu_max_freqs must be 1 to 16 numbers" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			fi
			;;
		cpu_implementer | cpu_architecture | cpu_variant | cpu_part | cpu_revision | gpu_max_clk)
			if [ -n "$value" ] && ! valid_u32 "$value"; then
				echo "invalid number for $key" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			fi
			;;
		mem_total_kb)
			if [ -n "$value" ] && ! valid_u64 "$value"; then
				echo "invalid number for $key" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			fi
			;;
		*)
			if [ -n "$value" ] && ! valid_text "$value" "$(text_limit "$key")"; then
				echo "invalid text for $key" >&2
				rm -f "$payload_file" "$tmp"
				return 2
			fi
			;;
		esac
		printf '%s=%s\n' "$key" "$value" >> "$tmp"
	done < "$payload_file"

	rm -f "$payload_file"
	mv "$tmp" "$CONFIG" || return 4
	apply
}

get() {
	if supported; then
		echo supported=1
	else
		echo supported=0
	fi
	if zygisk_installed; then
		echo neozygisk=1
	else
		echo neozygisk=0
	fi
	printf 'real_processor=%s\n' "$(sed -n 's/^Processor[[:space:]]*:[[:space:]]*//p' "$CPUINFO" 2> /dev/null | sed -n 1p)"
	printf 'real_cpu_hardware=%s\n' "$(sed -n 's/^Hardware[[:space:]]*:[[:space:]]*//p' "$CPUINFO" 2> /dev/null | sed -n 1p)"
	printf 'real_gpu=%s\n' "$(sed -n 1p "$GPU_MODEL" 2> /dev/null)"
	printf 'real_mem_total_kb=%s\n' "$(awk '/^MemTotal:/ { print $2; exit }' "$MEMINFO" 2> /dev/null)"
	printf 'real_soc_machine=%s\n' "$(sed -n 1p "$SOC_DIR/machine" 2> /dev/null)"
	for key in $CONFIG_KEYS; do
		printf '%s=%s\n' "$key" "$(cfg "$key")"
	done
}

reset_config() {
	if supported; then
		printf '1\n' > "$SYSFS/reset" 2> /dev/null || return 4
	fi
	rm -f "$CONFIG" "$PROPS_FILE" "$GL_FILE"
	echo "properties and Zygisk hooks return on the next reboot" >&2
	return 0
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
reset)
	reset_config
	;;
apps)
	apps
	;;
*)
	echo "usage: $0 get|set PAYLOAD|apply|reset|apps" >&2
	exit 1
	;;
esac
