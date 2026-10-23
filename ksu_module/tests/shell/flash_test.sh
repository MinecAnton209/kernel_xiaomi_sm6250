#!/bin/sh
# Runs bin/flash_kernel.sh against fake AnyKernel3 zips. Usage: sh ksu_module/tests/shell/flash_test.sh
# Needs zip, unzip and sha256sum; the installers here only print, so nothing is flashed.
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

sha_of() { sha256sum "$1" | cut -d' ' -f1; }

# run_flash ZIP OUT passes the real checksum of the zip; run_unverified leaves it out.
run_flash() {
	FLASH_BUSYBOX="$WORK/busybox" FLASH_WORK="$WORK/tmp" sh "$FLASH" "$1" "$2" "${3-$(sha_of "$1")}"
}
run_unverified() {
	FLASH_BUSYBOX="$WORK/busybox" FLASH_WORK="$WORK/tmp" sh "$FLASH" "$1" "$2"
}
# The log without the line about the checksum, so the checks below read only the installer output.
body() { grep -v -E '^(SHA-256 verified|warning: no checksum)' "$1.log"; }

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
check 'the installer gets the API level, the stdout descriptor and the zip' 'args: 3 1 good.zip' "$(body "$WORK/out_good" | sed -n 1p)"
check 'AKHOME points into the working directory' "akhome: $WORK/tmp/kernel_control_flash" "$(body "$WORK/out_good" | sed -n 2p | sed 's/\.[A-Za-z0-9]*\/tmp$//')"
check 'ui_print lines are written without the prefix' 'Checking device...' "$(body "$WORK/out_good" | sed -n 3p)"
check 'progress commands and empty ui_print lines are dropped' 'Done!' "$(body "$WORK/out_good" | sed -n 4p)"
check 'the log has no other lines' '4' "$(body "$WORK/out_good" | wc -l | tr -d ' ')"
check 'the pid file is written' 'yes' "$([ -s "$WORK/out_good.pid" ] && echo yes || echo no)"
check 'the working directory is removed' '0' "$(ls "$WORK/tmp" | wc -l | tr -d ' ')"

check 'a matching checksum is noted in the log first' "SHA-256 verified: $(sha_of "$WORK/good.zip")" "$(sed -n 1p "$WORK/out_good.log")"

run_unverified "$WORK/good.zip" "$WORK/out_noverify"
check 'without a checksum the flash still runs' 'done' "$(cat "$WORK/out_noverify.state")"
check 'but the log says the file was not verified' 'warning: no checksum was given, the file was not verified' "$(sed -n 1p "$WORK/out_noverify.log")"

run_flash "$WORK/good.zip" "$WORK/out_upper" "$(sha_of "$WORK/good.zip" | tr 'a-f' 'A-F')"
check 'an upper case checksum is accepted' 'done' "$(cat "$WORK/out_upper.state")"

WRONG=$(printf '0%.0s' $(seq 1 64))
run_flash "$WORK/good.zip" "$WORK/out_wrong" "$WRONG"
check 'a wrong checksum makes the script fail' '1' "$?"
check 'and the state is error' 'error' "$(cat "$WORK/out_wrong.state")"
check 'and the log shows both checksums' "checksum mismatch: expected $WRONG, got $(sha_of "$WORK/good.zip")" "$(tail -n 1 "$WORK/out_wrong.log")"
check 'and the installer never ran' '0' "$(grep -c 'args:' "$WORK/out_wrong.log")"
check 'and the working directory is removed' '0' "$(ls "$WORK/tmp" | wc -l | tr -d ' ')"

run_flash "$WORK/good.zip" "$WORK/out_short" 'abc123'
check 'a checksum that is too short is refused' '1' "$?"
check 'and the reason is in the log' 'not a SHA-256 checksum: abc123' "$(tail -n 1 "$WORK/out_short.log")"
run_flash "$WORK/good.zip" "$WORK/out_notsha" "$(printf 'g%.0s' $(seq 1 64))"
check 'a checksum with other characters is refused' '1' "$?"
run_flash "$WORK/good.zip" "$WORK/out_inject" '$(touch /tmp/pwned)aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
check 'a checksum with shell syntax is refused' '1' "$?"

# The check is done on the copy, so a zip that changes afterwards is not what gets flashed.
make_zip swapped 'echo "ui_print original"'
SWAPPED_SHA=$(sha_of "$WORK/swapped.zip")
make_zip other 'echo "ui_print tampered"'
cp "$WORK/other.zip" "$WORK/swapped.zip"
run_flash "$WORK/swapped.zip" "$WORK/out_swapped" "$SWAPPED_SHA"
check 'a zip that differs from its checksum is not flashed' 'error' "$(cat "$WORK/out_swapped.state")"
check 'and none of its output is in the log' '0' "$(grep -c 'tampered' "$WORK/out_swapped.log")"

make_zip bad 'echo "ui_print Unsupported device"
echo "ui_print Aborting..."
exit 1'
run_flash "$WORK/bad.zip" "$WORK/out_bad"
check 'a failing installer makes the script fail' '1' "$?"
check 'state is error' 'error' "$(cat "$WORK/out_bad.state")"
check 'the installer output is kept' 'Unsupported device' "$(body "$WORK/out_bad" | sed -n 1p)"
check 'and the exit code is explained' 'the installer exited with code 1' "$(tail -n 1 "$WORK/out_bad.log")"
check 'the working directory is removed after a failure' '0' "$(ls "$WORK/tmp" | wc -l | tr -d ' ')"

make_zip code7 'exit 7'
run_flash "$WORK/code7.zip" "$WORK/out_code7"
check 'the exit code of the installer is reported' 'the installer exited with code 7' "$(tail -n 1 "$WORK/out_code7.log")"

make_zip noisy 'echo "plain output without a prefix"
echo "ui_print with prefix"
exit 0'
run_flash "$WORK/noisy.zip" "$WORK/out_noisy"
check 'output without the prefix is kept' 'plain output without a prefix' "$(body "$WORK/out_noisy" | sed -n 1p)"
check 'output with the prefix loses it' 'with prefix' "$(body "$WORK/out_noisy" | sed -n 2p)"

make_zip nonewline 'printf "last line without a newline"
exit 0'
run_flash "$WORK/nonewline.zip" "$WORK/out_nonewline"
check 'output that ends without a newline is not lost' 'last line without a newline' "$(body "$WORK/out_nonewline")"
check 'and does not hide the exit code' 'done' "$(cat "$WORK/out_nonewline.state")"

make_zip stderr 'echo "something went wrong" >&2
exit 0'
run_flash "$WORK/stderr.zip" "$WORK/out_stderr"
check 'stderr of the installer is kept in the log' 'something went wrong' "$(body "$WORK/out_stderr" | sed -n 1p)"

mkdir -p "$WORK/src_module"
printf 'id=x\n' > "$WORK/src_module/module.prop"
(cd "$WORK/src_module" && zip -q -r "$WORK/module.zip" .)
run_flash "$WORK/module.zip" "$WORK/out_module"
check 'a zip without the installer is refused' '1' "$?"
check 'and the reason is in the log' 'not an AnyKernel3 zip: META-INF/com/google/android/update-binary is missing' "$(body "$WORK/out_module")"
check 'and the state is error' 'error' "$(cat "$WORK/out_module.state")"

run_flash "$WORK/missing.zip" "$WORK/out_missing" "$WRONG"
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
check 'and so does an output prefix with a space' 'ok' "$(body "$WORK/out spaced")"

run_flash "$WORK/good.zip" "$WORK/out_again"
run_flash "$WORK/bad.zip" "$WORK/out_again"
check 'a second run starts a fresh log' 'Unsupported device' "$(body "$WORK/out_again" | sed -n 1p)"
check 'and ends in the state of that run' 'error' "$(cat "$WORK/out_again.state")"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
