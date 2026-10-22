#!/usr/bin/env bash
# Runs ci/prerelease-assets.sh against a fake `gh`. Usage: bash ci/tests/prerelease_test.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../prerelease-assets.sh"
MANIFEST="$HERE/../make-manifest.sh"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

KERNEL_KEEP='miatoll-*|Image-*'
MODULE_KEEP='kernel_control-*'

check() {
  local name=$1 expected=$2 actual=$3
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL: %s\n  expected: [%s]\n  actual:   [%s]\n' "$name" "$expected" "$actual"
  fi
}

# A fake gh that keeps the release assets in $FAKE_GH_DIR/assets and logs what it deletes.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/gh" << 'EOF'
#!/usr/bin/env bash
dir=$FAKE_GH_DIR
case "$1 $2" in
"release view")
  [ -f "$dir/exists" ] || exit 1
  cat "$dir/assets"
  ;;
"release download")
  shift 3
  patterns=()
  out=.
  while [ $# -gt 0 ]; do
    case "$1" in
    --pattern) patterns+=("$2"); shift 2 ;;
    --dir) out=$2; shift 2 ;;
    *) shift ;;
    esac
  done
  found=0
  while IFS= read -r name; do
    for p in "${patterns[@]}"; do
      if [[ "$name" == $p ]]; then
        printf 'old:%s' "$name" > "$out/$name"
        found=1
      fi
    done
  done < "$dir/assets"
  [ "$found" = 1 ] || { echo "no assets match the file pattern" >&2; exit 1; }
  ;;
"release delete-asset")
  grep -vxF -- "$4" "$dir/assets" > "$dir/assets.tmp" || true
  mv "$dir/assets.tmp" "$dir/assets"
  echo "$4" >> "$dir/deleted"
  ;;
*)
  echo "unexpected gh call: $*" >&2
  exit 2
  ;;
esac
EOF
chmod +x "$WORK/bin/gh"

# A release holding an earlier build of both parts plus a legacy module name and the manifest.
new_release() {
  F="$WORK/$1"
  mkdir -p "$F"
  touch "$F/exists" "$F/deleted"
  printf '%s\n' \
    miatoll-default-10.zip miatoll-nethunter-10.zip Image-default-10.gz Image-nethunter-10.gz \
    kernel_control-10.zip ksu_susfs_ui-v1.1.0.zip manifest.json > "$F/assets"
  export FAKE_GH_DIR="$F"
}

assets() {
  sort "$FAKE_GH_DIR/assets" | tr '\n' ' ' | sed 's/ $//'
}

deleted() {
  sort "$FAKE_GH_DIR/deleted" | tr '\n' ' ' | sed 's/ $//'
}

list_dir() {
  ls "$1" | tr '\n' ' ' | sed 's/ $//'
}

run() {
  PATH="$WORK/bin:$PATH" bash "$SCRIPT" "$@"
}

new_dir() {
  N="$WORK/$1/new"
  rm -rf "$N"
  mkdir -p "$N"
  for name in "${@:2}"; do
    printf 'new:%s' "$name" > "$N/$name"
  done
}

# Both builds ran: nothing is kept.
new_release both
run clean unreleased ''
check 'both builds: every old asset is deleted' '' "$(assets)"
check 'both builds: the old manifest is deleted too' 'yes' "$(grep -qx manifest.json "$FAKE_GH_DIR/deleted" && echo yes || echo no)"
new_dir both miatoll-default-11.zip kernel_control-11.zip
run gather unreleased '' "$N" "$WORK/both/all"
check 'both builds: gather copies only the new assets' 'kernel_control-11.zip miatoll-default-11.zip' "$(list_dir "$WORK/both/all")"

# Kernel skipped: the module is rebuilt, the kernel assets stay.
new_release kernel_skipped
run clean unreleased "$KERNEL_KEEP"
check 'kernel skipped: the kernel zips and images stay' \
  'Image-default-10.gz Image-nethunter-10.gz miatoll-default-10.zip miatoll-nethunter-10.zip' "$(assets)"
check 'kernel skipped: the old module, the legacy module and the manifest are deleted' \
  'kernel_control-10.zip ksu_susfs_ui-v1.1.0.zip manifest.json' "$(deleted)"
new_dir kernel_skipped kernel_control-11.zip
run gather unreleased "$KERNEL_KEEP" "$N" "$WORK/kernel_skipped/all"
check 'kernel skipped: the manifest set holds the new module and the kept kernel assets' \
  'Image-default-10.gz Image-nethunter-10.gz kernel_control-11.zip miatoll-default-10.zip miatoll-nethunter-10.zip' \
  "$(list_dir "$WORK/kernel_skipped/all")"
check 'kernel skipped: the new module is the freshly built file' 'new:kernel_control-11.zip' "$(cat "$WORK/kernel_skipped/all/kernel_control-11.zip")"
check 'kernel skipped: the kept kernel zip is the one from the release' 'old:miatoll-default-10.zip' "$(cat "$WORK/kernel_skipped/all/miatoll-default-10.zip")"
check 'kernel skipped: gather does not touch the new directory' 'kernel_control-11.zip' "$(list_dir "$N")"

# Module skipped: the kernel is rebuilt, the module stays.
new_release module_skipped
run clean unreleased "$MODULE_KEEP"
check 'module skipped: only the current module zip stays' 'kernel_control-10.zip' "$(assets)"
check 'module skipped: old kernel assets, the legacy module and the manifest are deleted' \
  'Image-default-10.gz Image-nethunter-10.gz ksu_susfs_ui-v1.1.0.zip manifest.json miatoll-default-10.zip miatoll-nethunter-10.zip' "$(deleted)"
new_dir module_skipped miatoll-default-11.zip miatoll-nethunter-11.zip Image-default-11.gz Image-nethunter-11.gz
run gather unreleased "$MODULE_KEEP" "$N" "$WORK/module_skipped/all"
check 'module skipped: the manifest set holds the new kernel assets and the kept module' \
  'Image-default-11.gz Image-nethunter-11.gz kernel_control-10.zip miatoll-default-11.zip miatoll-nethunter-11.zip' \
  "$(list_dir "$WORK/module_skipped/all")"

# A file built in this run wins over a kept one with the same name.
new_release same_name
new_dir same_name kernel_control-10.zip
run gather unreleased "$MODULE_KEEP" "$N" "$WORK/same_name/all"
check 'a file from this run is not replaced by a kept one' 'new:kernel_control-10.zip' "$(cat "$WORK/same_name/all/kernel_control-10.zip")"

# Nothing to keep yet: the first partial run on a release that has no matching assets.
new_release no_match
printf 'manifest.json\n' > "$FAKE_GH_DIR/assets"
new_dir no_match kernel_control-11.zip
check 'no earlier kernel assets: gather still succeeds' '0' "$(run gather unreleased "$KERNEL_KEEP" "$N" "$WORK/no_match/all" > /dev/null 2>&1; echo $?)"
check 'no earlier kernel assets: only the new asset is gathered' 'kernel_control-11.zip' "$(list_dir "$WORK/no_match/all")"
check 'no earlier kernel assets: a warning is printed' '1' "$(run gather unreleased "$KERNEL_KEEP" "$N" "$WORK/no_match/all2" 2>&1 | grep -c '::warning::')"

# The very first run: no release at all.
new_release first_run
rm -f "$FAKE_GH_DIR/exists"
check 'no release yet: clean succeeds' '0' "$(run clean unreleased "$KERNEL_KEEP" > /dev/null 2>&1; echo $?)"
new_dir first_run miatoll-default-1.zip kernel_control-1.zip
check 'no release yet: gather with nothing kept succeeds' '0' "$(run gather unreleased '' "$N" "$WORK/first_run/all" > /dev/null 2>&1; echo $?)"
check 'no release yet: a partial gather still succeeds' '0' "$(run gather unreleased "$KERNEL_KEEP" "$N" "$WORK/first_run/all2" > /dev/null 2>&1; echo $?)"

# An empty release.
new_release empty_release
: > "$FAKE_GH_DIR/assets"
check 'an empty release: clean succeeds' '0' "$(run clean unreleased "$KERNEL_KEEP" > /dev/null 2>&1; echo $?)"
check 'an empty release: nothing is deleted' '' "$(deleted)"

# Names that merely look similar must not be kept.
new_release lookalikes
printf '%s\n' miatoll_umount_fix.zip Image.gz xmiatoll-default-1.zip kernel_control.zip miatoll-default-1.zip > "$FAKE_GH_DIR/assets"
run clean unreleased "$KERNEL_KEEP"
check 'only names that match a keep glob survive' 'miatoll-default-1.zip' "$(assets)"

# An asset whose name contains the glob characters themselves is still matched by the pattern.
new_release literal
printf '%s\n' 'kernel_control-*' kernel_control-5.zip > "$FAKE_GH_DIR/assets"
run clean unreleased "$MODULE_KEEP"
check 'a file named like the glob and a normal one both survive' '2' "$(assets | tr ' ' '\n' | grep -c 'kernel_control')"

# Arguments.
check 'no command fails' '1' "$(run > /dev/null 2>&1; echo $?)"
check 'an unknown command fails' '1' "$(run bogus > /dev/null 2>&1; echo $?)"
check 'gather with missing arguments fails' '1' "$(run gather unreleased > /dev/null 2>&1; echo $?)"
check 'clean with missing arguments fails' '1' "$(run clean > /dev/null 2>&1; echo $?)"

# The real manifest script over a gathered set, when jq is available (CI has it).
if command -v jq > /dev/null 2>&1; then
  new_release manifest
  new_dir manifest kernel_control-11.zip
  run gather unreleased "$KERNEL_KEEP" "$N" "$WORK/manifest/all"
  (cd "$ROOT" && REPO=o/r TAG=unreleased COMMIT=abc RUN_NUMBER=11 bash "$MANIFEST" Unreleased "$WORK/manifest/all" "$WORK/manifest/manifest.json")
  check 'the manifest lists the new module and the kept kernel assets' \
    'Image-default-10.gz Image-nethunter-10.gz kernel_control-11.zip miatoll-default-10.zip miatoll-nethunter-10.zip' \
    "$(jq -r '.assets[].name' "$WORK/manifest/manifest.json" | sort | tr '\n' ' ' | sed 's/ $//')"
  check 'the manifest hash matches the kept file' \
    "$(sha256sum "$WORK/manifest/all/miatoll-default-10.zip" | cut -d' ' -f1)" \
    "$(jq -r '.assets[] | select(.name == "miatoll-default-10.zip") | .sha256' "$WORK/manifest/manifest.json")"
  check 'the manifest url points at the unreleased tag' \
    'https://github.com/o/r/releases/download/unreleased/miatoll-default-10.zip' \
    "$(jq -r '.assets[] | select(.name == "miatoll-default-10.zip") | .url' "$WORK/manifest/manifest.json")"
else
  echo 'note: jq not installed, skipped the manifest checks'
fi

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
