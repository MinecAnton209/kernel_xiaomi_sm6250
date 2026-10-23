#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/config.sh"

PROPS="$CONF_DIR/spoof/props.txt"
[ -f "$PROPS" ] || exit 0

if command -v resetprop > /dev/null 2>&1; then
	RESETPROP=resetprop
elif [ -x "$KSU_BIN_DIR/resetprop" ]; then
	RESETPROP="$KSU_BIN_DIR/resetprop"
else
	exit 0
fi

while IFS= read -r line; do
	key=${line%%=*}
	value=${line#*=}
	[ -n "$key" ] || continue
	"$RESETPROP" -n "$key" "$value"
done < "$PROPS"
