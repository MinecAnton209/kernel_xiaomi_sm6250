#!/bin/sh
# Runs bin/flash_kernel.sh against fake AnyKernel3 zips. Usage: sh ksu_module/tests/shell/flash_test.sh
# Needs zip and unzip; the installers here only print, so nothing is flashed.
FLASH="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/flash_kernel.sh"
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

# The device has a busybox with these applets; the host's own tools stand in for them.
cat > "$WORK/busybox" << 'EOF'
#!/bin/sh
applet=$1
shift
case "$applet" in
unzip) exec unzip "$@" ;;
ash) exec sh "$@" ;;
chmod) exec chmod "$@" ;;
esac
exit 127
EOF
chmod +x "$WORK/busybox"

# make_zip NAME BODY builds NAME.zip whose installer is the shell script BODY.
make_zip() {
	dir="$WORK/src_$1"
	mkdir -p "$dir/META-INF/com/google/android"
	printf '%s\n' "$2" > "$dir/META-INF/com/google/android/update-binary"
	(cd "$dir" && zip -q -r "$WORK/$1.zip" .)
}

run_flash() {
	FLASH_BUSYBOX="$WORK/busybox" FLASH_WORK="$WORK/tmp" sh "$FLASH" "$@"
}

mkdir -p "$WORK/tmp"

make_zip good '#!/bin/sh
echo "args: $1 $2 $(basename "$3")"
echo "akhome: $AKHOME"
echo "ui_print Checking device..."
echo "ui_print"
echo "progress 0.5 10"
echo "ui_print Done!"
exit 0'
run_flash "$WORK/good.zip" "$WORK/out_good"
check 'a good installer exits zero' '0' "$?"
check 'state is done' 'done' "$(cat "$WORK/out_good.state")"
check 'the installer gets the API level, the stdout descriptor and the zip' 'args: 3 1 good.zip' "$(sed -n 1p "$WORK/out_good.log")"
check 'AKHOME points into the working directory' "akhome: $WORK/tmp/kernel_control_flash" "$(sed -n 2p "$WORK/out_good.log" | sed 's/\.[A-Za-z0-9]*\/tmp$//')"
check 'ui_print lines are written without the prefix' 'Checking device...' "$(sed -n 3p "$WORK/out_good.log")"
check 'progress commands and empty ui_print lines are dropped' 'Done!' "$(sed -n 4p "$WORK/out_good.log")"
check 'the log has no other lines' '4' "$(wc -l < "$WORK/out_good.log" | tr -d ' ')"
check 'the pid file is written' 'yes' "$([ -s "$WORK/out_good.pid" ] && echo yes || echo no)"
check 'the working directory is removed' '0' "$(ls "$WORK/tmp" | wc -l | tr -d ' ')"

make_zip bad 'echo "ui_print Unsupported device"
echo "ui_print Aborting..."
exit 1'
run_flash "$WORK/bad.zip" "$WORK/out_bad"
check 'a failing installer makes the script fail' '1' "$?"
check 'state is error' 'error' "$(cat "$WORK/out_bad.state")"
check 'the installer output is kept' 'Unsupported device' "$(sed -n 1p "$WORK/out_bad.log")"
check 'and the exit code is explained' 'the installer exited with code 1' "$(tail -n 1 "$WORK/out_bad.log")"
check 'the working directory is removed after a failure' '0' "$(ls "$WORK/tmp" | wc -l | tr -d ' ')"

make_zip code7 'exit 7'
run_flash "$WORK/code7.zip" "$WORK/out_code7"
check 'the exit code of the installer is reported' 'the installer exited with code 7' "$(tail -n 1 "$WORK/out_code7.log")"

make_zip noisy 'echo "plain output without a prefix"
echo "ui_print with prefix"
exit 0'
run_flash "$WORK/noisy.zip" "$WORK/out_noisy"
check 'output without the prefix is kept' 'plain output without a prefix' "$(sed -n 1p "$WORK/out_noisy.log")"
check 'output with the prefix loses it' 'with prefix' "$(sed -n 2p "$WORK/out_noisy.log")"

make_zip nonewline 'printf "last line without a newline"
exit 0'
run_flash "$WORK/nonewline.zip" "$WORK/out_nonewline"
check 'output that ends without a newline is not lost' 'last line without a newline' "$(cat "$WORK/out_nonewline.log")"
check 'and does not hide the exit code' 'done' "$(cat "$WORK/out_nonewline.state")"

make_zip stderr 'echo "something went wrong" >&2
exit 0'
run_flash "$WORK/stderr.zip" "$WORK/out_stderr"
check 'stderr of the installer is kept in the log' 'something went wrong' "$(sed -n 1p "$WORK/out_stderr.log")"

mkdir -p "$WORK/src_module"
printf 'id=x\n' > "$WORK/src_module/module.prop"
(cd "$WORK/src_module" && zip -q -r "$WORK/module.zip" .)
run_flash "$WORK/module.zip" "$WORK/out_module"
check 'a zip without the installer is refused' '1' "$?"
check 'and the reason is in the log' 'not an AnyKernel3 zip: META-INF/com/google/android/update-binary is missing' "$(cat "$WORK/out_module.log")"
check 'and the state is error' 'error' "$(cat "$WORK/out_module.state")"

run_flash "$WORK/missing.zip" "$WORK/out_missing"
check 'a missing file is refused' '1' "$?"
check 'and named in the log' "no such file: $WORK/missing.zip" "$(cat "$WORK/out_missing.log")"

cp "$WORK/good.zip" "$WORK/good.img"
run_flash "$WORK/good.img" "$WORK/out_img"
check 'a file that is not a zip is refused' '1' "$?"

FLASH_BUSYBOX="$WORK/nope" FLASH_WORK="$WORK/tmp" sh "$FLASH" "$WORK/good.zip" "$WORK/out_nobb"
check 'a missing busybox is refused' '1' "$?"
check 'and named in the log' "busybox not found: $WORK/nope" "$(cat "$WORK/out_nobb.log")"

sh "$FLASH" 2> /dev/null
check 'no arguments is a usage error' '2' "$?"
sh "$FLASH" "$WORK/good.zip" 2> /dev/null
check 'a missing output prefix is a usage error' '2' "$?"

make_zip spaced 'echo "ui_print ok"'
cp "$WORK/spaced.zip" "$WORK/with space.zip"
run_flash "$WORK/with space.zip" "$WORK/out spaced"
check 'a zip name with a space works' '0' "$?"
check 'and so does an output prefix with a space' 'ok' "$(cat "$WORK/out spaced.log")"

run_flash "$WORK/good.zip" "$WORK/out_again"
run_flash "$WORK/bad.zip" "$WORK/out_again"
check 'a second run starts a fresh log' 'Unsupported device' "$(sed -n 1p "$WORK/out_again.log")"
check 'and ends in the state of that run' 'error' "$(cat "$WORK/out_again.state")"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
