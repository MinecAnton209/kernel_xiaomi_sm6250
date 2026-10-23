#!/bin/sh
# Runs bin/spoof.sh with a fake sysfs, pm and resetprop. Usage: sh ksu_module/tests/shell/spoof_test.sh
SPOOF_SH="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/bin/spoof.sh"
POST_FS="$(cd "$(dirname "$0")/../.." && pwd)/kernel_control/post-fs-data.sh"
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

cat > "$WORK/pm" << 'EOF'
#!/bin/sh
case "$*" in
"list packages -U")
	printf 'package:com.android.settings uid:1000\npackage:com.bank.app uid:10150\npackage:com.game.big uid:10234\npackage:com.work.profile uid:1010151\n'
	;;
"list packages -3")
	printf 'package:com.game.big\npackage:com.bank.app\npackage:com.zeta.tool\n'
	;;
esac
EOF
cat > "$WORK/resetprop" << 'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_RP_CALLS"
EOF
chmod +x "$WORK/pm" "$WORK/resetprop"

new_env() {
	FAKE="$WORK/$1"
	mkdir -p "$FAKE/sys" "$FAKE/proc" "$FAKE/soc" "$FAKE/zygisk"
	printf 'Processor\t: AArch64 Processor rev 4 (aarch64)\nHardware\t: Qualcomm Technologies, Inc SM712\n' > "$FAKE/proc/cpuinfo"
	printf 'MemTotal:        5700000 kB\n' > "$FAKE/proc/meminfo"
	printf 'Adreno (TM) 618\n' > "$FAKE/proc/gpu_model"
	printf 'Qualcomm Technologies, Inc. SM712\n' > "$FAKE/soc/machine"
	: > "$FAKE/resetprop_calls"
	export FAKE
	export FAKE_RP_CALLS="$FAKE/resetprop_calls"
	export SPOOF_CONF_DIR="$FAKE/conf"
	export SPOOF_SYSFS="$FAKE/sys"
	export SPOOF_ZYGISK_DIR="$FAKE/zygisk"
	export SPOOF_PM="$WORK/pm"
	export SPOOF_RESETPROP="$WORK/resetprop"
	export SPOOF_CPUINFO="$FAKE/proc/cpuinfo"
	export SPOOF_MEMINFO="$FAKE/proc/meminfo"
	export SPOOF_GPU_MODEL="$FAKE/proc/gpu_model"
	export SPOOF_SOC_DIR="$FAKE/soc"
}

spoof_sh() { sh "$SPOOF_SH" "$@"; }

payload() { printf '%s\n' "$@"; }

full_payload() {
	payload \
		'enabled=1' \
		'profile=poco-x3' \
		'scope=apps' \
		'props=1' \
		'zygisk=1' \
		'brand=POCO' \
		'manufacturer=Xiaomi' \
		'model=POCO X3 NFC' \
		'device=surya' \
		'product=surya_global' \
		'board=sm7150' \
		'hardware=qcom' \
		'soc_manufacturer=Qualcomm' \
		'soc_model=SM7150-AC' \
		'cpu_hardware=Qualcomm Technologies, Inc SM7150' \
		'cpu_processor=AArch64 Processor rev 1 (aarch64)' \
		'cpu_model_name=ARMv8 Processor rev 1' \
		'cpu_implementer=0x41' \
		'cpu_architecture=8' \
		'cpu_variant=1' \
		'cpu_part=0xd0b' \
		'cpu_revision=1' \
		'cpu_max_freqs=1800000 1800000 1800000 1800000 1800000 1800000 2300000 2300000' \
		'gpu_model=Adreno (TM) 618' \
		'gpu_max_clk=750000000' \
		'gl_renderer=Adreno (TM) 618' \
		'gl_vendor=Qualcomm' \
		'soc_machine=Qualcomm Technologies, Inc. SM7150' \
		'soc_family=Snapdragon 720G' \
		'soc_id=SM7150' \
		'soc_revision=v1.0' \
		'mem_total_kb=5700000' \
		'dt_model=Xiaomi POCO X3 NFC' \
		'dt_compatible=qcom,sm7150-mtp'
}

cfg_value() { grep -m1 "^$1=" "$SPOOF_CONF_DIR/spoof/config" 2> /dev/null | cut -d= -f2-; }
sysfs_value() { cat "$SPOOF_SYSFS/$1" 2> /dev/null; }
prop_value() { grep -m1 "^$1=" "$SPOOF_CONF_DIR/spoof/props.txt" 2> /dev/null | cut -d= -f2-; }

new_env fresh
rmdir "$SPOOF_SYSFS" "$SPOOF_ZYGISK_DIR"
out=$(spoof_sh get)
check 'fresh install reports no kernel interface' 'supported=0' "$(printf '%s\n' "$out" | grep '^supported=')"
check 'fresh install reports no NeoZygisk' 'neozygisk=0' "$(printf '%s\n' "$out" | grep '^neozygisk=')"
check 'fresh install is not enabled' 'enabled=' "$(printf '%s\n' "$out" | grep '^enabled=')"

new_env status
out=$(spoof_sh get)
check 'an installed kernel interface is reported' 'supported=1' "$(printf '%s\n' "$out" | grep '^supported=')"
check 'an installed NeoZygisk is reported' 'neozygisk=1' "$(printf '%s\n' "$out" | grep '^neozygisk=')"
check 'the real processor is read from cpuinfo' 'real_processor=AArch64 Processor rev 4 (aarch64)' "$(printf '%s\n' "$out" | grep '^real_processor=')"
check 'the real GPU is read' 'real_gpu=Adreno (TM) 618' "$(printf '%s\n' "$out" | grep '^real_gpu=')"

new_env full
out=$(spoof_sh set "$(full_payload)")
check 'a full payload applies' '0' "$?"
check 'the kernel is enabled last' '1' "$(sysfs_value enabled)"
check 'the scope reaches the kernel' 'apps' "$(sysfs_value scope)"
check 'the CPU part reaches the kernel' '0xd0b' "$(sysfs_value cpu_part)"
check 'the GPU model reaches the kernel' 'Adreno (TM) 618' "$(sysfs_value gpu_model)"
check 'the memory size reaches the kernel' '5700000' "$(sysfs_value mem_total_kb)"
check 'the device tree model reaches the kernel' 'Xiaomi POCO X3 NFC' "$(sysfs_value dt_model)"
check 'a non-selected scope clears the uid list' 'default' "$(sysfs_value uids)"
check 'the profile is saved' 'poco-x3' "$(cfg_value profile)"
check 'the model is saved' 'POCO X3 NFC' "$(cfg_value model)"
check 'the property file has the model' 'POCO X3 NFC' "$(prop_value ro.product.model)"
check 'the property file has the board' 'sm7150' "$(prop_value ro.board.platform)"
check 'the property file has the product name' 'surya_global' "$(prop_value ro.product.name)"
check 'the property file does not leak kernel-only keys' '' "$(prop_value cpu_part)"
check 'the running property area is updated' '1' "$(grep -c '^-n ro.product.model POCO X3 NFC$' "$FAKE_RP_CALLS")"
check 'get returns the saved model' 'model=POCO X3 NFC' "$(spoof_sh get | grep '^model=')"

new_env selected
out=$(spoof_sh set "$(full_payload | sed 's/^scope=apps$/scope=selected/; s/^props=1$/props=0/; s/^apps=$//' )")
check 'selected without apps applies' '0' "$?"
check 'selected with no apps clears the uid list' 'default' "$(sysfs_value uids)"
out=$(spoof_sh set "$(payload 'enabled=1' 'scope=selected' 'apps=com.bank.app com.game.big' 'props=0')")
check 'selected with apps applies' '0' "$?"
check 'selected apps are written as app ids' '10150 10234' "$(sysfs_value uids)"
out=$(spoof_sh set "$(payload 'enabled=1' 'scope=selected' 'apps=com.bank.app com.gone.app' 'props=0')")
check 'a missing package does not fail' '0' "$?"
check 'a missing package is reported' 'missing=com.gone.app' "$(printf '%s\n' "$out" | grep '^missing=')"
check 'only the installed app is written' '10150' "$(sysfs_value uids)"
out=$(spoof_sh set "$(payload 'enabled=1' 'scope=selected' 'apps=com.work.profile' 'props=0')")
check 'a work profile uid is reduced to its app id' '10151' "$(sysfs_value uids)"

new_env scopes
spoof_sh set "$(payload 'enabled=1' 'scope=all' 'props=0')" > /dev/null
check 'scope all is accepted' 'all' "$(sysfs_value scope)"
spoof_sh set "$(payload 'enabled=1' 'scope=root' 'props=0')" > /dev/null
check 'scope root is accepted' 'root' "$(sysfs_value scope)"
spoof_sh set "$(payload 'enabled=1' 'scope=apps' 'props=0')" > /dev/null
check 'scope apps is accepted' 'apps' "$(sysfs_value scope)"

new_env disable
spoof_sh set "$(payload 'enabled=1' 'props=1' 'model=POCO X3 NFC')" > /dev/null
check 'enabling with props writes the property file' 'yes' "$([ -f "$SPOOF_CONF_DIR/spoof/props.txt" ] && echo yes || echo no)"
spoof_sh set "$(payload 'enabled=0' 'props=0' 'model=POCO X3 NFC')" > /dev/null
check 'disabling clears the kernel switch' '0' "$(sysfs_value enabled)"
check 'disabling removes the property file' 'no' "$([ -f "$SPOOF_CONF_DIR/spoof/props.txt" ] && echo yes || echo no)"

new_env unsupported
rmdir "$SPOOF_SYSFS"
spoof_sh set "$(payload 'enabled=1' 'scope=apps')" > /dev/null 2>&1
check 'a kernel without the interface is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
check 'the settings are still saved for the next kernel' 'yes' "$([ -f "$SPOOF_CONF_DIR/spoof/config" ] && echo yes || echo no)"

new_env invalid
spoof_sh set "$(payload 'enabled=1' 'bogus=1')" > /dev/null 2>&1
check 'an unknown key is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' 'scope=everyone')" > /dev/null 2>&1
check 'an unknown scope is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' 'apps=not a package')" > /dev/null 2>&1
check 'a bad package list is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' 'cpu_part=zzz')" > /dev/null 2>&1
check 'a bad u32 is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' 'cpu_max_freqs=1800000 nope')" > /dev/null 2>&1
check 'a bad frequency list is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' 'model=default')" > /dev/null 2>&1
check 'the reserved word default is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
long=$(printf '%065d' 0)
spoof_sh set "$(payload 'enabled=1' "model=$long")" > /dev/null 2>&1
check 'text past the kernel limit is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
check 'an invalid payload does not leave a config' 'no' "$([ -f "$SPOOF_CONF_DIR/spoof/config" ] && echo yes || echo no)"

new_env reset
spoof_sh set "$(payload 'enabled=1' 'props=1' 'model=POCO X3 NFC')" > /dev/null
spoof_sh reset > /dev/null 2>&1
check 'reset clears the kernel state' '1' "$(sysfs_value reset)"
check 'reset removes the config' 'no' "$([ -f "$SPOOF_CONF_DIR/spoof/config" ] && echo yes || echo no)"
check 'reset removes the property file' 'no' "$([ -f "$SPOOF_CONF_DIR/spoof/props.txt" ] && echo yes || echo no)"

new_env post_fs
mkdir -p "$WORK/post/module" "$WORK/post/bin" "$FAKE/conf/spoof"
cp "$POST_FS" "$WORK/post/module/post-fs-data.sh"
cat > "$WORK/post/module/config.sh" << EOF
MODULE_ID=kernel_control
MODULES_DIR=$WORK/post/modules
CONF_DIR=$FAKE/conf
ZYGISK_MODULE_ID=zygisksu
ZYGISK_DIR=$WORK/post/modules/zygisksu
KSU_BIN_DIR=$WORK/post/bin
EOF
cp "$WORK/resetprop" "$WORK/post/bin/resetprop"
chmod +x "$WORK/post/bin/resetprop"
printf 'ro.product.model=POCO X3 NFC\nro.soc.model=SM7150-AC\n' > "$FAKE/conf/spoof/props.txt"
sh "$WORK/post/module/post-fs-data.sh"
check 'post-fs-data applies the saved properties' '2' "$(wc -l < "$FAKE_RP_CALLS" | tr -d ' ')"
check 'post-fs-data passes the value' '1' "$(grep -c '^-n ro.soc.model SM7150-AC$' "$FAKE_RP_CALLS")"

text_of() { head -c "$1" /dev/zero | tr '\0' x; }

new_env limits
spoof_sh set "$(payload 'enabled=1' "cpu_hardware=$(text_of 63)" 'props=0')" > /dev/null 2>&1
check 'a 63-character kernel string is accepted' '0' "$?"
check 'a 63-character kernel string reaches the kernel' "$(text_of 63)" "$(sysfs_value cpu_hardware)"
spoof_sh set "$(payload 'enabled=1' "cpu_hardware=$(text_of 64)" 'props=0')" > /dev/null 2>&1
check 'a 64-character kernel string is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' "dt_model=$(text_of 127)" 'props=0')" > /dev/null 2>&1
check 'a 127-character device tree model is accepted' '0' "$?"
spoof_sh set "$(payload 'enabled=1' "dt_model=$(text_of 128)" 'props=0')" > /dev/null 2>&1
check 'a 128-character device tree model is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' "dt_compatible=$(text_of 255)" 'props=0')" > /dev/null 2>&1
check 'a 255-character compatible string is accepted' '0' "$?"
check 'a 255-character compatible string reaches the kernel' "$(text_of 255)" "$(sysfs_value dt_compatible)"
spoof_sh set "$(payload 'enabled=1' "dt_compatible=$(text_of 256)" 'props=0')" > /dev/null 2>&1
check 'a 256-character compatible string is refused' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
spoof_sh set "$(payload 'enabled=1' "gl_renderer=$(text_of 128)" 'props=0')" > /dev/null 2>&1
check 'a 128-character GL renderer is accepted' '0' "$?"

new_env refused
spoof_sh set "$(payload 'enabled=1' 'scope=apps' 'props=0')" > /dev/null
rm -f "$SPOOF_SYSFS/cpu_part" && mkdir "$SPOOF_SYSFS/cpu_part"
err=$(spoof_sh set "$(payload 'enabled=1' 'cpu_part=0xd0b' 'gpu_model=Adreno (TM) 640' 'scope=apps' 'props=0')" 2>&1 > /dev/null)
check 'a refused kernel value makes set fail' 'nonzero' "$([ $? -ne 0 ] && echo nonzero || echo zero)"
check 'the refused key is named' '1' "$(printf '%s\n' "$err" | grep -c '^the kernel refused cpu_part$')"
check 'the kernel switch is on after a refused value' '1' "$(sysfs_value enabled)"
check 'the other values still reach the kernel after a refused one' 'Adreno (TM) 640' "$(sysfs_value gpu_model)"
check 'the refused value stays in the saved settings' '0xd0b' "$(cfg_value cpu_part)"

gl_conf() { printf '%s' "$SPOOF_CONF_DIR/spoof/gl.conf"; }

new_env gl
spoof_sh set "$(payload 'enabled=1' 'zygisk=1' 'gl_renderer=Adreno (TM) 640' 'scope=selected' 'apps=com.bank.app' 'props=0')" > /dev/null
check 'the GL hook config is written when NeoZygisk is installed' 'yes' "$([ -f "$(gl_conf)" ] && echo yes || echo no)"
check 'the GL hook config keeps the renderer' '1' "$(grep -c '^renderer=Adreno (TM) 640$' "$(gl_conf)")"
check 'the GL hook config keeps the scope' '1' "$(grep -c '^scope=selected$' "$(gl_conf)")"
check 'the GL hook config keeps the app list' '1' "$(grep -c '^apps=com.bank.app$' "$(gl_conf)")"
check 'the GL hook config is enabled' '1' "$(grep -c '^enabled=1$' "$(gl_conf)")"

spoof_sh set "$(payload 'enabled=1' 'zygisk=0' 'gl_renderer=Adreno (TM) 640' 'scope=apps' 'props=0')" > /dev/null
check 'the GL hook config is removed when Zygisk is off' 'no' "$([ -f "$(gl_conf)" ] && echo yes || echo no)"

new_env gl_no_neozygisk
rmdir "$SPOOF_ZYGISK_DIR"
spoof_sh set "$(payload 'enabled=1' 'zygisk=1' 'gl_renderer=Adreno (TM) 640' 'scope=apps' 'props=0')" > /dev/null
check 'the GL hook config is not written without NeoZygisk' 'no' "$([ -f "$(gl_conf)" ] && echo yes || echo no)"

new_env gl_disable
spoof_sh set "$(payload 'enabled=1' 'zygisk=1' 'gl_renderer=Adreno (TM) 640' 'scope=apps' 'props=0')" > /dev/null
spoof_sh set "$(payload 'enabled=0' 'zygisk=1' 'gl_renderer=Adreno (TM) 640' 'scope=apps' 'props=0')" > /dev/null
check 'disabling the module removes the GL hook config' 'no' "$([ -f "$(gl_conf)" ] && echo yes || echo no)"

new_env gl_reset
spoof_sh set "$(payload 'enabled=1' 'zygisk=1' 'gl_renderer=Adreno (TM) 640' 'scope=apps' 'props=0')" > /dev/null
spoof_sh reset > /dev/null 2>&1
check 'reset removes the GL hook config' 'no' "$([ -f "$(gl_conf)" ] && echo yes || echo no)"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
