#!/system/bin/sh
# Usage: fetch.sh <url> <output> [threads=4] [sha256]
# Downloads with parallel HTTP range requests and falls back to one stream
# when the server does not report a size or does not honour ranges.

URL="$1"
OUT="$2"
THREADS="${3:-4}"
SHA="${4:-}"

command -v curl >/dev/null 2>&1 || { echo "curl not found" >&2; exit 1; }

single() {
  curl -fsSL --retry 2 -o "$OUT" "$URL"
}

split() {
  part=$(( (SIZE + THREADS - 1) / THREADS ))
  i=0
  pids=""
  while [ "$i" -lt "$THREADS" ]; do
    start=$(( i * part ))
    [ "$start" -ge "$SIZE" ] && break
    end=$(( start + part - 1 ))
    [ "$end" -ge "$SIZE" ] && end=$(( SIZE - 1 ))
    curl -fsSL --retry 3 -r "$start-$end" -o "$OUT.part$i" "$URL" &
    pids="$pids $!"
    i=$(( i + 1 ))
  done

  failed=0
  for pid in $pids; do
    wait "$pid" || failed=1
  done

  total=0
  i=0
  while [ "$i" -lt "$THREADS" ] && [ -f "$OUT.part$i" ]; do
    total=$(( total + $(stat -c %s "$OUT.part$i") ))
    i=$(( i + 1 ))
  done

  if [ "$failed" -eq 0 ] && [ "$total" -eq "$SIZE" ]; then
    : > "$OUT"
    i=0
    while [ "$i" -lt "$THREADS" ] && [ -f "$OUT.part$i" ]; do
      cat "$OUT.part$i" >> "$OUT"
      i=$(( i + 1 ))
    done
    rm -f "$OUT".part*
    return 0
  fi

  rm -f "$OUT".part*
  single
}

SIZE=$(curl -sIL --retry 2 "$URL" | tr -d '\r' | awk 'tolower($1) == "content-length:" { size = $2 } END { print size }')

case "$SIZE" in
  ''|*[!0-9]*|0)
    single || exit 1
    ;;
  *)
    split || exit 1
    ;;
esac

if [ -n "$SHA" ]; then
  actual=$(sha256sum "$OUT" | cut -d' ' -f1)
  if [ "$actual" != "$SHA" ]; then
    echo "sha256 mismatch: expected $SHA, got $actual" >&2
    rm -f "$OUT"
    exit 1
  fi
fi
