// Keep these in step with kernel_control/config.sh; tests/shell/config_test.sh checks that they match.
export const MODULE_ID = 'kernel_control';
export const MODULES_DIR = '/data/adb/modules';
export const CONF = '/data/adb/kernel_control';

export const MODULE_DIR = `${MODULES_DIR}/${MODULE_ID}`;
export const BIN = `${MODULE_DIR}/bin/ksu_susfs`;
export const TUNE = `${MODULE_DIR}/bin/tune.sh`;
export const CHARGE = `${MODULE_DIR}/bin/charge.sh`;
export const UNAME = `${MODULE_DIR}/bin/uname.sh`;
export const SPOOF = `${MODULE_DIR}/bin/spoof.sh`;
export const DEBUG = `${MODULE_DIR}/bin/debug.sh`;
export const SENSORS = `${MODULE_DIR}/bin/sensors.sh`;
export const PROFILE = `${MODULE_DIR}/bin/profile.sh`;
export const FLASH_KERNEL = `${MODULE_DIR}/bin/flash_kernel.sh`;
/** Prefix of the .log, .state and .pid files that flash_kernel.sh writes. */
export const FLASH_OUT = `/data/local/tmp/${MODULE_ID}_flash`;
/** What the KernelSU manager runs to reboot (KsuCli.kt, `reboot()`): the power service first, the binary as a fallback. */
export const REBOOT_COMMAND = '/system/bin/svc power reboot || /system/bin/reboot';
export const MODULE_ZIP = `/data/local/tmp/${MODULE_ID}_update.zip`;
export const MODULE_ASSET_RE = new RegExp(`^${MODULE_ID}-.*\\.zip$`);
export const PATH_RE = /^\/[A-Za-z0-9._/-]{1,255}$/;
export const TAB_KEY = `${MODULE_ID}_tab`;

export function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function confFile(name: string): string {
  return quote(`${CONF}/${name}`);
}
