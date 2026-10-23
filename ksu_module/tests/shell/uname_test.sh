#!/bin/sh
# Runs bin/uname.sh with a fake ksu_susfs and a fake pm. Usage: sh ksu_module/tests/shell/uname_test.sh
UNAME_SH="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/uname.sh"
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

# A fake ksu_susfs: show_features prints $FAKE_FEATURES, every other command is appended to the call log,
# and FAKE_FAIL makes the named command fail.
cat > "$WORK/ksu_susfs" << 'EOF'
#!/bin/sh
if [ "$1" = show_features ]; then
	cat "$FAKE_DIR/features" 2> /dev/null
	exit 0
fi
printf '%s\n' "$*" >> "$FAKE_DIR/calls"
[ "$1" = "$FAKE_FAIL" ] && exit 1
exit 0
EOF
cat > "$WORK/pm" << 'EOF'
#!/bin/sh
case "$*" in
"list packages -U")
	printf 'package:com.android.settings uid:1000\npackage:com.bank.app uid:10150\npackage:com.game.big uid:10234\npackage:com.work.profile uid:1010151\n'
	;;
"list packages -3")
	printf 'package:com.game.big\npackage:com.bank.app\npackage:com.zeta.tool\n'
	;;
esac
EOF
chmod +x "$WORK/ksu_susfs" "$WORK/pm"

new_env() {
	FAKE_DIR="$WORK/$1"
	mkdir -p "$FAKE_DIR"
	printf 'sus_path=1\nuname_scope=1\n' > "$FAKE_DIR/features"
	export FAKE_DIR
	export UNAME_CONF_DIR="$FAKE_DIR/conf"
	export UNAME_BIN="$WORK/ksu_susfs"
	export UNAME_PM="$WORK/pm"
	export UNAME_REAL="4.14.336-real"
	unset FAKE_FAIL
}
uname_sh() { sh "$UNAME_SH" "$@"; }
calls() { cat "$FAKE_DIR/calls" 2> /dev/null; }
fails() {
	name=$1
	shift
	"$@" > /dev/null 2>&1
	check "$name" 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
}

REL='4.14.190-perf-g8e1c4f7a2b9d'
VER='#1 SMP PREEMPT Thu Jan 14 02:31:07 CST 2021'

new_env get_empty
out=$(uname_sh get)
check 'get on a fresh install reports the real release' 'real=4.14.336-real' "$(printf '%s\n' "$out" | grep '^real=')"
check 'get reports that the kernel supports the scope' 'supported=1' "$(printf '%s\n' "$out" | grep '^supported=')"
check 'get on a fresh install is not enabled' 'enabled=' "$(printf '%s\n' "$out" | grep '^enabled=')"
check 'get on a fresh install lists no apps' '0' "$(printf '%s\n' "$out" | grep -c '^app=')"

new_env get_old_kernel
printf 'sus_path=1\nspoof_uname=1\n' > "$FAKE_DIR/features"
check 'a kernel without uname_scope is reported as unsupported' 'supported=0' "$(uname_sh get | grep '^supported=')"

new_env set_apps
uname_sh set 1 "$REL" "$VER" apps
check 'set with scope apps succeeds' '0' "$?"
check 'set sends the release and the version' "set_uname $REL $VER" "$(calls | sed -n 1p)"
check 'set with scope apps sends the apps scope' 'set_uname_scope apps' "$(calls | sed -n 2p)"
check 'set sends exactly two commands' '2' "$(calls | wc -l | tr -d ' ')"
out=$(uname_sh get)
check 'get returns the saved release' "release=$REL" "$(printf '%s\n' "$out" | grep '^release=')"
check 'get returns the saved version' "version=$VER" "$(printf '%s\n' "$out" | grep '^version=')"
check 'get returns the saved scope' 'scope=apps' "$(printf '%s\n' "$out" | grep '^scope=')"
check 'get returns that it is enabled' 'enabled=1' "$(printf '%s\n' "$out" | grep '^enabled=')"

new_env set_selected
uname_sh set 1 "$REL" "$VER" selected com.game.big com.bank.app com.work.profile > "$WORK/out.txt"
check 'set with selected apps succeeds' '0' "$?"
check 'selected apps are sent as app ids, in the order of the package list' 'set_uname_scope selected 10150 10234 10151' "$(calls | sed -n 2p)"
check 'a work profile uid is reduced to its app id' '10151' "$(calls | sed -n 2p | awk '{print $5}')"
check 'a package that is installed is not reported missing' '0' "$(grep -c 'missing=' "$WORK/out.txt")"
check 'get lists the saved apps in order' "$(printf 'app=com.game.big\napp=com.bank.app\napp=com.work.profile')" "$(uname_sh get | grep '^app=')"

new_env set_missing
uname_sh set 1 "$REL" "$VER" selected com.game.big com.gone.app > "$WORK/out.txt"
check 'a missing package does not fail the call' '0' "$?"
check 'a missing package is reported' 'missing=com.gone.app' "$(grep 'missing=' "$WORK/out.txt")"
check 'only the installed app is sent' 'set_uname_scope selected 10234' "$(calls | grep selected)"

new_env set_selected_empty
uname_sh set 1 "$REL" "$VER" selected
check 'selected with no apps succeeds' '0' "$?"
check 'and sends an empty list, so nobody is spoofed' 'set_uname_scope selected' "$(calls | grep selected)"

new_env set_duplicates
uname_sh set 1 "$REL" "$VER" selected com.game.big com.game.big
check 'a package named twice is saved once' '1' "$(uname_sh get | grep -c '^app=')"

new_env system_apps_are_not_ids
uname_sh set 1 "$REL" "$VER" selected com.android.settings > "$WORK/out.txt"
check 'a system uid is sent as given, and the kernel rejects it' 'set_uname_scope selected 1000' "$(calls | grep selected)"

new_env set_disabled
uname_sh set 1 "$REL" "$VER" apps
: > "$FAKE_DIR/calls"
uname_sh set 0 "$REL" "$VER" apps
check 'turning it off restores the real values' "$(printf 'set_uname default default\nset_uname_scope apps')" "$(calls)"
check 'turning it off keeps the text for the next time' "release=$REL" "$(uname_sh get | grep '^release=')"
check 'turning it off is saved' 'enabled=0' "$(uname_sh get | grep '^enabled=')"

new_env rejects
fails 'enabled other than 0 or 1' uname_sh set 2 "$REL" "$VER" apps
fails 'unknown scope' uname_sh set 1 "$REL" "$VER" everyone
fails 'empty release' uname_sh set 1 '' "$VER" apps
fails 'empty version' uname_sh set 1 "$REL" '' apps
fails 'release of default, which the kernel reads as the real one' uname_sh set 1 default "$VER" apps
fails 'version of default' uname_sh set 1 "$REL" default apps
fails 'release longer than 64 characters' uname_sh set 1 "$(printf 'a%.0s' $(seq 1 65))" "$VER" apps
fails 'a non ASCII release' uname_sh set 1 '4.14-ядро' "$VER" apps
fails 'a release with a newline' uname_sh set 1 "$(printf '4.14\nx')" "$VER" apps
fails 'a package name with a space' uname_sh set 1 "$REL" "$VER" selected 'com.a b'
fails 'a package name that is not dotted' uname_sh set 1 "$REL" "$VER" selected game
fails 'a package name with shell characters' uname_sh set 1 "$REL" "$VER" selected 'com.a;reboot'
fails 'a package name starting with a digit' uname_sh set 1 "$REL" "$VER" selected '1com.app'
fails 'too few arguments' uname_sh set 1 "$REL" "$VER"
check 'nothing was sent to the kernel by the rejected calls' '0' "$(calls | wc -l | tr -d ' ')"
check 'nothing was saved by the rejected calls' 'no' "$([ -e "$FAKE_DIR/conf/uname/enabled" ] && echo yes || echo no)"

new_env limits
exactly_64=$(printf 'a%.0s' $(seq 1 64))
uname_sh set 1 "$exactly_64" "$VER" apps
check 'a release of exactly 64 characters is accepted' '0' "$?"
many=$(for i in $(seq 1 65); do printf 'com.app%s ' "$i"; done)
# shellcheck disable=SC2086
fails 'more than 64 apps' uname_sh set 1 "$REL" "$VER" selected $many

new_env old_kernel
printf 'spoof_uname=1\n' > "$FAKE_DIR/features"
uname_sh set 1 "$REL" "$VER" apps > /dev/null 2>&1
check 'an old kernel makes apply fail with code 3' '3' "$?"
check 'and gets no command at all, because it would spoof for everyone' '0' "$(calls | wc -l | tr -d ' ')"

new_env apply_boot
uname_sh set 1 "$REL" "$VER" selected com.bank.app > /dev/null
: > "$FAKE_DIR/calls"
uname_sh apply
check 'apply sends the saved settings again after a boot' "$(printf 'set_uname %s %s\nset_uname_scope selected 10150' "$REL" "$VER")" "$(calls)"

new_env apply_never_configured
uname_sh apply
check 'apply with nothing saved turns the spoof off' "$(printf 'set_uname default default\nset_uname_scope apps')" "$(calls)"

new_env kernel_refuses
export FAKE_FAIL=set_uname
uname_sh set 1 "$REL" "$VER" apps > /dev/null 2>&1
check 'a failing set_uname makes the call fail with code 4' '4' "$?"
export FAKE_FAIL=set_uname_scope
uname_sh set 1 "$REL" "$VER" apps > /dev/null 2>&1
check 'a failing set_uname_scope makes the call fail with code 4' '4' "$?"

new_env special_characters
uname_sh set 1 '4.14.190-perf+' '#1 SMP PREEMPT Thu Jan 14 02:31:07 CST 2021 ($x `y` "z")' apps
check 'shell characters in the version are passed through untouched' '#1 SMP PREEMPT Thu Jan 14 02:31:07 CST 2021 ($x `y` "z")' "$(uname_sh get | sed -n 's/^version=//p')"
check 'and reach the kernel command as one argument' 'set_uname 4.14.190-perf+ #1 SMP PREEMPT Thu Jan 14 02:31:07 CST 2021 ($x `y` "z")' "$(calls | sed -n 1p)"

new_env apps_list
check 'apps lists third party packages sorted' "$(printf 'com.bank.app\ncom.game.big\ncom.zeta.tool')" "$(uname_sh apps)"

new_env usage
fails 'no command' uname_sh
fails 'unknown command' uname_sh nonsense

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
