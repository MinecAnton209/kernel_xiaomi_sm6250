#!/usr/bin/env bash
# Runs ci/stamp-module-version.sh on copies of module.prop. Usage: bash ci/tests/stamp_version_test.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../stamp-module-version.sh"
REAL_PROP="$HERE/../../ksu_module/kernel_control/module.prop"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

check() {
  local name=$1 expected=$2 actual=$3
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL: %s\n  expected: [%s]\n  actual:   [%s]\n' "$name" "$expected" "$actual"
  fi
}

SHA=e34731a82c1f0b9d7a6c5e4d3b2a19087f6e5d4c

fresh() {
  printf 'id=kernel_control\nname=Kernel Control\nversion=v1.1.0\nversionCode=2\nauthor=x\n' > "$WORK/module.prop"
}
version() { grep '^version=' "$WORK/module.prop"; }

fresh
bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'a full sha is cut to 7 characters' 'version=v1.1.0-e34731a' "$(version)"
check 'the other lines stay as they were' \
  $'id=kernel_control\nname=Kernel Control\nversion=v1.1.0-e34731a\nversionCode=2\nauthor=x' "$(cat "$WORK/module.prop")"

bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'stamping twice does not stack suffixes' 'version=v1.1.0-e34731a' "$(version)"

bash "$SCRIPT" "$WORK/module.prop" 1234567abcdef
check 'stamping again replaces the earlier hash' 'version=v1.1.0-1234567' "$(version)"

fresh
bash "$SCRIPT" "$WORK/module.prop" ABCDEF0123456789
check 'an upper case sha is written in lower case' 'version=v1.1.0-abcdef0' "$(version)"

fresh
bash "$SCRIPT" "$WORK/module.prop" abcdef0
check 'a sha of exactly 7 characters works' 'version=v1.1.0-abcdef0' "$(version)"

fresh
printf 'version=v2.0.0-beta\n' > "$WORK/module.prop"
bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'a suffix that is not a hash is kept' 'version=v2.0.0-beta-e34731a' "$(version)"

fresh
bash "$SCRIPT" "$WORK/module.prop" abc12 2> /dev/null
check 'a sha shorter than 7 characters fails' '1' "$?"
check 'and leaves the file alone' 'version=v1.1.0' "$(version)"

bash "$SCRIPT" "$WORK/module.prop" 'not-a-sha!' 2> /dev/null
check 'a sha with other characters fails' '1' "$?"

bash "$SCRIPT" "$WORK/module.prop" '' 2> /dev/null
check 'an empty sha fails' '1' "$?"

printf 'id=x\n' > "$WORK/module.prop"
bash "$SCRIPT" "$WORK/module.prop" "$SHA" 2> /dev/null
check 'a module.prop without a version fails' '1' "$?"
check 'and is not changed' 'id=x' "$(cat "$WORK/module.prop")"

bash "$SCRIPT" "$WORK/missing.prop" "$SHA" 2> /dev/null
check 'a missing file fails' '1' "$?"
check 'and leaves no temporary file behind' '1' "$(ls "$WORK" | wc -l | tr -d ' ')"

fresh
bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'without a run number no build line is written' '0' "$(grep -c '^build=' "$WORK/module.prop")"

fresh
bash "$SCRIPT" "$WORK/module.prop" "$SHA" 48
check 'a run number is written as build=' 'build=48' "$(grep '^build=' "$WORK/module.prop")"
check 'together with the stamped version' 'version=v1.1.0-e34731a' "$(version)"
check 'and the other lines stay in place' \
  $'id=kernel_control\nname=Kernel Control\nversion=v1.1.0-e34731a\nversionCode=2\nauthor=x\nbuild=48' "$(cat "$WORK/module.prop")"

bash "$SCRIPT" "$WORK/module.prop" "$SHA" 49
check 'stamping again replaces the build line instead of adding one' '1' "$(grep -c '^build=' "$WORK/module.prop")"
check 'with the new number' 'build=49' "$(grep '^build=' "$WORK/module.prop")"

bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'stamping again without a run number keeps the build line' 'build=49' "$(grep '^build=' "$WORK/module.prop")"

fresh
bash "$SCRIPT" "$WORK/module.prop" "$SHA" abc 2> /dev/null
check 'a run number with letters fails' '1' "$?"
bash "$SCRIPT" "$WORK/module.prop" "$SHA" '1;reboot' 2> /dev/null
check 'a run number with shell syntax fails' '1' "$?"
bash "$SCRIPT" "$WORK/module.prop" "$SHA" 1234567890 2> /dev/null
check 'a run number of ten digits fails' '1' "$?"
check 'and none of them touched the file' 'version=v1.1.0' "$(version)"
check 'or added a build line' '0' "$(grep -c '^build=' "$WORK/module.prop")"

cp "$REAL_PROP" "$WORK/module.prop"
bash "$SCRIPT" "$WORK/module.prop" "$SHA"
check 'the real module.prop is stamped' "$(grep '^version=' "$REAL_PROP")-e34731a" "$(version)"
check 'and the real module.prop in the repo is untouched' '0' "$(grep -c 'e34731a' "$REAL_PROP")"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
