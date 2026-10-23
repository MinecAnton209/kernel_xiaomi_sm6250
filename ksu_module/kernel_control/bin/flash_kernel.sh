#!/system/bin/sh
# Usage: flash_kernel.sh <AnyKernel3 zip> <output prefix> [sha256]
# Flashes a kernel zip the way the KernelSU manager does: the installer script inside the zip is
# run with busybox, and AnyKernel3 itself checks the device name and writes the boot partition.
# With a sha256 the zip is checked against it first, and a mismatch stops everything before the
# installer is even unpacked. The check runs on a private copy of the zip, which is also the copy
# that gets flashed, so the file cannot change between the check and the flash.
# Run detached. The installer output goes to <prefix>.log, the stage to <prefix>.state ("running",
# "done" or "error") and the script pid to <prefix>.pid so the WebUI can tell if it died.
# FLASH_BUSYBOX and FLASH_WORK exist so the tests can run without a device.

ZIP="$1"
OUT="$2"
SHA=$(printf '%s' "$3" | tr 'A-F' 'a-f')

BUSYBOX=${FLASH_BUSYBOX:-/data/adb/ksu/bin/busybox}
WORK_BASE=${FLASH_WORK:-/data/local/tmp}
INSTALLER=META-INF/com/google/android/update-binary

LOG="$OUT.log"
STATE="$OUT.state"

set_state() {
	printf '%s' "$1" > "$STATE"
}

fail() {
	echo "$1" >> "$LOG"
	set_state error
	exit 1
}

[ -n "$ZIP" ] && [ -n "$OUT" ] || {
	echo "usage: $0 <zip> <output prefix> [sha256]" >&2
	exit 2
}

printf '%s' "$$" > "$OUT.pid"
: > "$LOG"
set_state running

[ -x "$BUSYBOX" ] || fail "busybox not found: $BUSYBOX"
[ -f "$ZIP" ] || fail "no such file: $ZIP"
case "$ZIP" in
*.zip) ;;
*) fail "not a zip file: $ZIP" ;;
esac
if [ -n "$3" ] && ! printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{64}$'; then
	fail "not a SHA-256 checksum: $3"
fi

WORK=$(mktemp -d "$WORK_BASE/kernel_control_flash.XXXXXX") || fail "cannot create a working directory"
trap 'rm -rf "$WORK"' EXIT

NAME=${ZIP##*/}
cp "$ZIP" "$WORK/$NAME" || fail "cannot copy the zip"

if [ -n "$SHA" ]; then
	actual=$(sha256sum "$WORK/$NAME" | cut -d' ' -f1)
	[ "$actual" = "$SHA" ] || fail "checksum mismatch: expected $SHA, got $actual"
	echo "SHA-256 verified: $actual" >> "$LOG"
else
	echo "warning: no checksum was given, the file was not verified" >> "$LOG"
fi

# A zip without the installer would be a module or a random archive, and there is nothing to run.
"$BUSYBOX" unzip -l "$WORK/$NAME" 2> /dev/null | grep -q "$INSTALLER" || fail "not an AnyKernel3 zip: $INSTALLER is missing"
"$BUSYBOX" unzip -p -o "$WORK/$NAME" "$INSTALLER" > "$WORK/update-binary" 2> /dev/null || fail "cannot read the installer"
"$BUSYBOX" chmod 755 "$WORK/update-binary"

# Arguments are what a recovery passes: the API level, the output descriptor (1 is stdout) and the zip.
# The installer prints "ui_print <text>" lines; the prefix and the progress commands are not for a reader.
(
	cd "$WORK" || exit 1
	AKHOME="$WORK/tmp" "$BUSYBOX" ash ./update-binary 3 1 "$WORK/$NAME" 2>&1
	# Kept in a file: the exit status of a pipeline is that of its last command, not of the installer.
	echo $? > "$WORK/rc"
) | while IFS= read -r line || [ -n "$line" ]; do
	case "$line" in
	"ui_print "*) printf '%s\n' "${line#ui_print }" >> "$LOG" ;;
	"ui_print" | progress* | set_progress*) ;;
	*) printf '%s\n' "$line" >> "$LOG" ;;
	esac
done

rc=$(cat "$WORK/rc" 2> /dev/null)
if [ "$rc" = 0 ]; then
	set_state done
else
	fail "the installer exited with code ${rc:-unknown}"
fi
