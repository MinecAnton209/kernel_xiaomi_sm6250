#!/bin/sh
# Checks that the module's shared names stay in one place and that customize.sh migrates
# the pre-rename install. Usage: sh ksu_module/tests/shell/config_test.sh
BASE="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="$BASE/kernel_control"
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

exists() {
	[ -e "$1" ] && echo yes || echo no
}

content() {
	read -r line < "$1"
	printf '%s' "$line"
}

. "$MODULE/config.sh"

prop_id=$(grep '^id=' "$MODULE/module.prop")
check 'module.prop id matches config.sh' "id=$MODULE_ID" "$prop_id"

ts="$BASE/webui/src/core/config.ts"
check 'config.ts MODULE_ID matches config.sh' "export const MODULE_ID = '$MODULE_ID';" "$(grep '^export const MODULE_ID' "$ts")"
check 'config.ts MODULES_DIR matches config.sh' "export const MODULES_DIR = '$MODULES_DIR';" "$(grep '^export const MODULES_DIR' "$ts")"
check 'config.ts CONF matches config.sh' "export const CONF = '$CONF_DIR';" "$(grep '^export const CONF ' "$ts")"

# Scripts and sources must use the shared names instead of repeating the literals.
literals=$(
	{
		printf '%s\n' "$MODULE/service.sh" "$MODULE/post-fs-data.sh" "$MODULE/customize.sh" "$MODULE/bin/tune.sh" "$MODULE/bin/fetch.sh" "$MODULE/bin/uname.sh" "$MODULE/bin/spoof.sh"
		find "$BASE/webui/src" -name '*.ts'
	} | xargs grep -lE '/data/adb/(kernel_control|susfs_ui|modules)|ksu_susfs_ui' 2> /dev/null | grep -v '/core/config\.ts$' | tr '\n' ' '
)
check 'no hardcoded module paths outside the config files' '' "$literals"

# customize.sh runs inside the manager, which provides ui_print and set_perm.
install_module() {
	(
		MODPATH="$1"
		ui_print() { :; }
		set_perm() { :; }
		. "$MODPATH/customize.sh"
	)
}

new_install() {
	I="$WORK/$1"
	mkdir -p "$I/modpath" "$I/modules"
	cp "$MODULE/customize.sh" "$I/modpath/customize.sh"
	cat > "$I/modpath/config.sh" << EOF
MODULE_ID=kernel_control
MODULES_DIR=$I/modules
CONF_DIR=$I/new_conf
OLD_MODULE_ID=ksu_susfs_ui
OLD_CONF_DIR=$I/old_conf
EOF
}

new_install fresh
install_module "$I/modpath"
check 'fresh install creates the config dir' 'yes' "$(exists "$I/new_conf")"
check 'fresh install creates an empty paths.txt' 'yes' "$(exists "$I/new_conf/paths.txt")"
check 'fresh install leaves no old module marker' 'no' "$(exists "$I/modules/ksu_susfs_ui/remove")"

new_install migrate
mkdir -p "$I/old_conf"
printf '/system/xbin/su\n' > "$I/old_conf/paths.txt"
printf '0' > "$I/old_conf/log"
printf '2' > "$I/old_conf/sus_su"
install_module "$I/modpath"
check 'migrates paths.txt' '/system/xbin/su' "$(content "$I/new_conf/paths.txt")"
check 'migrates the log setting' '0' "$(content "$I/new_conf/log")"
check 'migrates the sus_su setting' '2' "$(content "$I/new_conf/sus_su")"
check 'keeps the old config in place' 'yes' "$(exists "$I/old_conf/paths.txt")"

new_install keep_new
mkdir -p "$I/old_conf" "$I/new_conf"
printf '/old/path\n' > "$I/old_conf/paths.txt"
printf '/new/path\n' > "$I/new_conf/paths.txt"
install_module "$I/modpath"
check 'an existing new config is not overwritten' '/new/path' "$(content "$I/new_conf/paths.txt")"

new_install old_module
mkdir -p "$I/modules/ksu_susfs_ui"
install_module "$I/modpath"
check 'marks the old module for removal' 'yes' "$(exists "$I/modules/ksu_susfs_ui/remove")"

new_install reinstall
install_module "$I/modpath"
printf '/kept\n' > "$I/new_conf/paths.txt"
install_module "$I/modpath"
check 'reinstalling keeps the saved paths' '/kept' "$(content "$I/new_conf/paths.txt")"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
