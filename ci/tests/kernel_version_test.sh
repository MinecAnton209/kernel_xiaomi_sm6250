#!/usr/bin/env bash
# Runs ci/kernel-version.sh on throwaway git repos. Usage: bash ci/tests/kernel_version_test.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../kernel-version.sh"
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

# new_repo DIR creates a repo with one commit that has miatoll.version 1.0.0.
new_repo() {
  mkdir -p "$1"
  printf '1.0.0\n' > "$1/miatoll.version"
  git -C "$1" init -q
  git -C "$1" add miatoll.version
  git -C "$1" -c user.name=test -c user.email=test@example.com -c commit.gpgsign=false commit -q -m init
}

commit_hash() {
  git -C "$1" rev-parse --short HEAD
}

REPO="$WORK/untagged"
new_repo "$REPO"
check 'an untagged commit gets the short commit after the version' "1.0.0-$(commit_hash "$REPO")" "$(bash "$SCRIPT" "$REPO")"

git -C "$REPO" tag v1.0.0
check 'an exact v* tag is a release and gets the plain version' '1.0.0' "$(bash "$SCRIPT" "$REPO")"

git -C "$REPO" -c user.name=test -c user.email=test@example.com -c commit.gpgsign=false commit -q --allow-empty -m next
check 'a commit after the tag is no release again' "1.0.0-$(commit_hash "$REPO")" "$(bash "$SCRIPT" "$REPO")"

PRE="$WORK/prerelease"
new_repo "$PRE"
git -C "$PRE" tag unreleased
check 'the rolling unreleased tag is not a release' "1.0.0-$(commit_hash "$PRE")" "$(bash "$SCRIPT" "$PRE")"

PADDED="$WORK/padded"
new_repo "$PADDED"
printf '  1.0.0 \n\n' > "$PADDED/miatoll.version"
git -C "$PADDED" -c user.name=test -c user.email=test@example.com -c commit.gpgsign=false commit -q -am pad
git -C "$PADDED" tag v1.0.0
check 'whitespace around the version is dropped' '1.0.0' "$(bash "$SCRIPT" "$PADDED")"

PLAIN="$WORK/plain"
mkdir -p "$PLAIN"
printf '1.0.0\n' > "$PLAIN/miatoll.version"
check 'outside git the plain version is printed without a commit' '1.0.0' "$(bash "$SCRIPT" "$PLAIN")"

NOFILE="$WORK/nofile"
mkdir -p "$NOFILE"
check 'a tree without miatoll.version reports unknown' 'unknown' "$(bash "$SCRIPT" "$NOFILE")"

printf 'pass=%s fail=%s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
