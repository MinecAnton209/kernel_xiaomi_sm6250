#!/bin/sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
kernel=$(cd "$here/../.." && pwd)
clang=${CLANG:-$kernel/../clang/bin/clang}
ld=$(dirname "$clang")/ld.lld
resdir=$("$clang" --target=aarch64-linux-gnu -print-resource-dir)

flags="--target=aarch64-linux-gnu -nostdlib -nostdinc -isystem $resdir/include -static -fuse-ld=$ld -fno-builtin -ffreestanding -fno-stack-protector -fPIE -O2 -Wall -D__KERNEL__ -include $here/inc/prelude.h -I$here/inc -I$kernel/include/uapi -I$kernel/include"

"$clang" $flags -o "$here/tinymix" "$here/tinymix.c"
"$clang" $flags -DVALUE=1 -o "$here/tinyset_on" "$here/tinyset.c"
"$clang" $flags -DVALUE=0 -o "$here/tinyset_off" "$here/tinyset.c"

profile_flags='-DCONTROL="TAS25XX_ALGO_PROFILE"'
"$clang" $flags "$profile_flags" -DVALUE=1 -o "$here/tinyprof_music" "$here/tinyset.c"
"$clang" $flags "$profile_flags" -DVALUE=2 -o "$here/tinyprof_voice" "$here/tinyset.c"
"$clang" $flags "$profile_flags" -DVALUE=3 -o "$here/tinyprof_voip" "$here/tinyset.c"
"$clang" $flags "$profile_flags" -DVALUE=4 -o "$here/tinyprof_ringtone" "$here/tinyset.c"
