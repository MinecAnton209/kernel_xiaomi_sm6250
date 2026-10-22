#!/system/bin/sh
# Usage: fetch.sh <url> <output> [threads=4] [sha256]
# Run detached. Progress goes to <output>.progress ("<done> <total>"), the
# stage to <output>.state ("running", "verifying", "done" or "error") and the
# script pid to <output>.pid so the WebUI can cancel it.
# Uses parallel range requests and falls back to one stream when the server
# does not report a size or does not honour ranges.

URL="$1"
OUT="$2"
THREADS="${3:-4}"
SHA="${4:-}"

STATE="$OUT.state"
PROGRESS="$OUT.progress"

set_state() {
  printf '%s' "$1" > "$STATE"
}

fail() {
  echo "$1" >&2
  set_state error
  rm -f "$OUT" "$OUT".part*
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl not found"

sum_bytes() {
  total=0
  for f in "$@"; do
    [ -f "$f" ] && total=$(( total + $(stat -c %s "$f") ))
  done
  echo "$total"
}

# Polls file sizes until every pid exits, so the WebUI can show progress.
watch_pids() {
  while :; do
    alive=0
    for pid in $1; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    printf '%s %s' "$(sum_bytes $2)" "$SIZE" > "$PROGRESS"
    [ "$alive" -eq 0 ] && break
    sleep 1
  done
}

single() {
  curl -fsSL --retry 2 -o "$OUT" "$URL" &
  pid=$!
  watch_pids "$pid" "$OUT"
  wait "$pid"
}

split() {
  part=$(( (SIZE + THREADS - 1) / THREADS ))
  i=0
  pids=""
  parts=""
  while [ "$i" -lt "$THREADS" ]; do
    start=$(( i * part ))
    [ "$start" -ge "$SIZE" ] && break
    end=$(( start + part - 1 ))
    [ "$end" -ge "$SIZE" ] && end=$(( SIZE - 1 ))
    curl -fsSL --retry 3 -r "$start-$end" -o "$OUT.part$i" "$URL" &
    pids="$pids $!"
    parts="$parts $OUT.part$i"
    i=$(( i + 1 ))
  done

  watch_pids "$pids" "$parts"

  failed=0
  for pid in $pids; do
    wait "$pid" || failed=1
  done

  total=$(sum_bytes $parts)
  if [ "$failed" -eq 0 ] && [ "$total" -eq "$SIZE" ]; then
    : > "$OUT"
    for f in $parts; do
      cat "$f" >> "$OUT"
    done
    rm -f "$OUT".part*
    return 0
  fi

  rm -f "$OUT".part*
  single
}

printf '%s' "$$" > "$OUT.pid"
set_state running
printf '0 0' > "$PROGRESS"

SIZE=$(curl -sIL --retry 2 "$URL" | tr -d '\r' | awk 'tolower($1) == "content-length:" { size = $2 } END { print size }')

case "$SIZE" in
  ''|*[!0-9]*|0)
    SIZE=0
    single || fail "download failed"
    ;;
  *)
    split || fail "download failed"
    ;;
esac

size=$(sum_bytes "$OUT")
printf '%s %s' "$size" "$size" > "$PROGRESS"

if [ -n "$SHA" ]; then
  set_state verifying
  expected=$(printf '%s' "$SHA" | tr 'A-F' 'a-f')
  actual=$(sha256sum "$OUT" | cut -d' ' -f1)
  if [ "$actual" != "$expected" ]; then
    rm -f "$OUT"
    fail "Контрольная сумма не совпала: ожидалась $expected, получена $actual"
  fi
fi

set_state done
