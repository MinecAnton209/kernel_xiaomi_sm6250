#!/bin/sh
# Runs bin/fetch.sh end to end against file:// URLs, which curl serves with sizes and ranges.
# Usage: sh ksu_module/tests/fetch_test.sh
FETCH="$(cd "$(dirname "$0")/.." && pwd)/kernel_control/bin/fetch.sh"
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

content() {
	read -r line < "$1" 2> /dev/null
	printf '%s' "$line"
}

exists() {
	[ -e "$1" ] && echo yes || echo no
}

# An odd size, so the four parts are uneven and the last one is shorter.
SRC="$WORK/src.bin"
head -c 1000003 /dev/urandom > "$SRC"
SIZE=1000003
SUM=$(sha256sum "$SRC" | cut -d' ' -f1)

OUT="$WORK/ok.bin"
check 'parallel download exits zero' '0' "$(sh "$FETCH" "file://$SRC" "$OUT" 4 > "$WORK/ok.log" 2>&1; echo $?)"
check 'parallel download is byte for byte identical' '0' "$(cmp -s "$SRC" "$OUT"; echo $?)"
check 'parallel download ends in the done state' 'done' "$(content "$OUT.state")"
check 'final progress reports the whole file' "$SIZE $SIZE" "$(content "$OUT.progress")"
check 'part files are cleaned up' '0' "$(ls "$OUT".part* 2> /dev/null | wc -l | tr -d ' ')"
check 'the pid is recorded for cancelling' 'yes' "$(exists "$OUT.pid")"

OUT="$WORK/checked.bin"
check 'a matching checksum succeeds' '0' "$(sh "$FETCH" "file://$SRC" "$OUT" 4 "$SUM" > "$WORK/checked.log" 2>&1; echo $?)"
check 'a matching checksum ends in done' 'done' "$(content "$OUT.state")"

UPPER=$(printf '%s' "$SUM" | tr 'a-f' 'A-F')
OUT="$WORK/upper.bin"
check 'an upper case checksum is accepted' '0' "$(sh "$FETCH" "file://$SRC" "$OUT" 4 "$UPPER" > "$WORK/upper.log" 2>&1; echo $?)"

OUT="$WORK/bad.bin"
BAD=0000000000000000000000000000000000000000000000000000000000000000
check 'a wrong checksum fails' '1' "$(sh "$FETCH" "file://$SRC" "$OUT" 4 "$BAD" > "$WORK/bad.log" 2>&1; echo $?)"
check 'a wrong checksum ends in error' 'error' "$(content "$OUT.state")"
check 'a wrong checksum deletes the download' 'no' "$(exists "$OUT")"
check 'a wrong checksum is explained in the log' '1' "$(grep -c 'Контрольная сумма не совпала' "$WORK/bad.log")"

OUT="$WORK/single.bin"
check 'a single thread works' '0' "$(sh "$FETCH" "file://$SRC" "$OUT" 1 > "$WORK/single.log" 2>&1; echo $?)"
check 'a single thread download is identical' '0' "$(cmp -s "$SRC" "$OUT"; echo $?)"

OUT="$WORK/many.bin"
check 'more threads than needed works' '0' "$(sh "$FETCH" "file://$SRC" "$OUT" 16 > "$WORK/many.log" 2>&1; echo $?)"
check 'more threads than needed is identical' '0' "$(cmp -s "$SRC" "$OUT"; echo $?)"

tiny="$WORK/tiny.src"
printf 'abc' > "$tiny"
OUT="$WORK/tiny.bin"
check 'a file smaller than the thread count works' '0' "$(sh "$FETCH" "file://$tiny" "$OUT" 4 > "$WORK/tiny.log" 2>&1; echo $?)"
check 'a file smaller than the thread count is identical' '0' "$(cmp -s "$tiny" "$OUT"; echo $?)"

OUT="$WORK/missing.bin"
check 'a missing source fails' '1' "$(sh "$FETCH" "file://$WORK/nope.bin" "$OUT" 4 > "$WORK/missing.log" 2>&1; echo $?)"
check 'a missing source ends in error' 'error' "$(content "$OUT.state")"
check 'a missing source leaves no output' 'no' "$(exists "$OUT")"

# part_sizes is what lets the WebUI show which part is lagging.
eval "$(awk '/^part_sizes\(\) \{/,/^\}/' "$FETCH")"
printf 'xxx' > "$WORK/p0"
printf 'xxxxx' > "$WORK/p1"
check 'part_sizes lists the size of each file' ' 3 5' "$(part_sizes "$WORK/p0" "$WORK/p1")"
check 'part_sizes reports a missing file as zero' ' 3 0 5' "$(part_sizes "$WORK/p0" "$WORK/nope" "$WORK/p1")"
check 'part_sizes with no files prints nothing' '' "$(part_sizes)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
