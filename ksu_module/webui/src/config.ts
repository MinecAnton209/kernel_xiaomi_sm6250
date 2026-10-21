export const CONF = '/data/adb/susfs_ui';
export const BIN = '/data/adb/modules/ksu_susfs_ui/bin/ksu_susfs';
export const PATH_RE = /^\/[A-Za-z0-9._/-]{1,255}$/;
export const TAB_KEY = 'susfs_ui_tab';

export function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function confFile(name: string): string {
  return quote(`${CONF}/${name}`);
}
