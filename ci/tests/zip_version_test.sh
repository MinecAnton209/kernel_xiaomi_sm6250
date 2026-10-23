#!/usr/bin/env bash
# Runs ci/zip-version.sh on small zips. Usage: bash ci/tests/zip_version_test.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../zip-version.sh"
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

# make_zip NAME FILE CONTENT puts FILE with CONTENT into NAME.zip.
make_zip() {
  local dir="$WORK/src_$1"
  mkdir -p "$dir/$(dirname "$2")"
  printf '%s' "$3" > "$dir/$2"
  (cd "$dir" && zip -q -r "$WORK/$1.zip" .)
}

make_zip module module.prop $'id=kernel_control\nversion=v1.1.0-7ae22c4\nversionCode=2\nbuild=52\n'
check 'the version of a module build is printed' 'v1.1.0-7ae22c4' "$(bash "$SCRIPT" "$WORK/module.zip")"

make_zip release module.prop $'id=kernel_control\nversion=v1.1.0\n'
check 'a release version has no hash' 'v1.1.0' "$(bash "$SCRIPT" "$WORK/release.zip")"

make_zip crlf module.prop $'id=x\r\nversion=v2.0.0-abcdef0\r\n'
check 'a carriage return is dropped' 'v2.0.0-abcdef0' "$(bash "$SCRIPT" "$WORK/crlf.zip")"

make_zip twice module.prop $'version=v1\nversion=v2\n'
check 'only the first version line counts' 'v1' "$(bash "$SCRIPT" "$WORK/twice.zip")"

make_zip noversion module.prop $'id=x\nname=y\n'
check 'a module.prop without a version prints nothing' '' "$(bash "$SCRIPT" "$WORK/noversion.zip")"

make_zip kernel META-INF/com/google/android/update-binary 'echo hi'
check 'a kernel zip has no module.prop and prints nothing' '' "$(bash "$SCRIPT" "$WORK/kernel.zip")"

make_zip nested sub/module.prop $'version=v9.9.9\n'
check 'a module.prop that is not at the root is ignored' '' "$(bash "$SCRIPT" "$WORK/nested.zip")"

printf 'version=v3.0.0\n' > "$WORK/module.prop"
check 'a file that is not a zip prints nothing' '' "$(bash "$SCRIPT" "$WORK/module.prop")"
printf 'not a zip' > "$WORK/broken.zip"
check 'a broken zip prints nothing' '' "$(bash "$SCRIPT" "$WORK/broken.zip")"
check 'a missing file prints nothing' '' "$(bash "$SCRIPT" "$WORK/missing.zip")"

for name in module kernel broken missing; do
  bash "$SCRIPT" "$WORK/$name.zip" > /dev/null 2>&1
  check "$name exits zero" '0' "$?"
done
check 'and prints nothing on stderr for a broken zip' '' "$(bash "$SCRIPT" "$WORK/broken.zip" 2>&1 >/dev/null)"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
