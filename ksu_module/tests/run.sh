#!/bin/sh
# Runs every module test: the shell tests against fake sysfs trees, then the WebUI tests with Node.
# Usage: sh ksu_module/tests/run.sh
# Node must be on PATH; the shell tests need nothing but sh and coreutils (fetch_test.sh also curl).
HERE="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

for test in "$HERE"/shell/*_test.sh; do
	output=$(sh "$test" 2>&1)
	status=$?
	printf '%s: %s\n' "${test#"$HERE"/}" "$(printf '%s\n' "$output" | tail -n 1)"
	[ "$status" = 0 ] || FAILED=1
done

output=$(node --test "$HERE"/webui/*.test.mjs 2>&1)
status=$?
echo "webui:"
printf '%s\n' "$output" | grep -E '^(✖|ℹ (tests|pass|fail))'
[ "$status" = 0 ] || FAILED=1

if [ "$FAILED" = 0 ]; then
	echo "all passed"
else
	echo "FAILED"
fi
exit "$FAILED"
