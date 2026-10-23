import type { MessageKey } from './i18n.ts';

export type UnameScope = 'apps' | 'selected';

export interface UnameState {
  /** The release the kernel really has, as root sees it. */
  real: string;
  /** False on a kernel that cannot limit the spoof to apps; the module then refuses to send anything. */
  supported: boolean;
  enabled: boolean;
  release: string;
  version: string;
  scope: UnameScope;
  apps: string[];
}

export interface UnamePreset {
  id: string;
  /** Shown as it is: the names are models and ROMs, which are not translated. */
  label: string;
  release: string;
  version: string;
}

export const MAX_TEXT_LENGTH = 64;
export const MAX_APPS = 64;

/**
 * Strings in the shape the stock 4.14 kernels of this phone family report. The hashes and dates are
 * examples of that shape, not copies of one particular build.
 */
export const UNAME_PRESETS: readonly UnamePreset[] = [
  {
    id: 'xiaomi-4.14.190',
    label: 'Xiaomi stock 4.14.190',
    release: '4.14.190-perf-g3f6a1c0b8d25',
    version: '#1 SMP PREEMPT Fri Jan 15 03:12:44 CST 2021',
  },
  {
    id: 'xiaomi-4.14.186',
    label: 'Xiaomi stock 4.14.186',
    release: '4.14.186-perf-g9c2d7e41a05b',
    version: '#1 SMP PREEMPT Wed Mar 10 22:41:09 CST 2021',
  },
  {
    id: 'caf-4.14.117',
    label: 'Qualcomm CAF 4.14.117',
    release: '4.14.117-perf+',
    version: '#1 SMP PREEMPT Tue Oct 20 11:27:36 CST 2020',
  },
  {
    id: 'android-4.14.261',
    label: 'Android common 4.14.261',
    release: '4.14.261-g0b7f1c93d6a4',
    version: '#1 SMP PREEMPT Mon Apr 11 09:14:52 UTC 2022',
  },
];

export const CUSTOM_PRESET = 'custom';

/** The id of the preset that has exactly these strings, or `custom` for anything else. */
export function matchPreset(release: string, version: string): string {
  const found = UNAME_PRESETS.find((preset) => preset.release === release && preset.version === version);
  return found ? found.id : CUSTOM_PRESET;
}

/** Same rules as `uname.sh`: printable ASCII, 1 to 64 characters, and not the word the kernel reads as "real". */
export function validateText(text: string): MessageKey | undefined {
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH || text === 'default' || !/^[ -~]+$/.test(text)) {
    return 'uname.invalidText';
  }
  return undefined;
}

export function isPackageName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(name);
}

/** Why a package cannot be added to the list, or undefined when it can. */
export function validatePackage(name: string, existing: readonly string[]): MessageKey | undefined {
  if (!isPackageName(name)) return 'uname.invalidPackage';
  if (existing.includes(name)) return 'uname.duplicate';
  if (existing.length >= MAX_APPS) return 'uname.tooMany';
  return undefined;
}

/** Parses the `key=value` lines of `uname.sh get`; every `app=` line adds a package. */
export function parseUname(stdout: string): UnameState {
  const state: UnameState = {
    real: '',
    supported: false,
    enabled: false,
    release: '',
    version: '',
    scope: 'apps',
    apps: [],
  };
  for (const line of stdout.split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at);
    const value = line.slice(at + 1).replace(/\r$/, '');
    switch (key) {
      case 'real':
        state.real = value.trim();
        break;
      case 'supported':
        state.supported = value.trim() === '1';
        break;
      case 'enabled':
        state.enabled = value.trim() === '1';
        break;
      case 'release':
        state.release = value;
        break;
      case 'version':
        state.version = value;
        break;
      case 'scope':
        state.scope = value.trim() === 'selected' ? 'selected' : 'apps';
        break;
      case 'app':
        if (value.trim() !== '') state.apps.push(value.trim());
        break;
    }
  }
  return state;
}

/** The packages `uname.sh set` could not find on the phone, from its `missing=` lines. */
export function parseMissing(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('missing='))
    .map((line) => line.slice('missing='.length).trim())
    .filter((name) => name !== '');
}

/** One package name per line, as `uname.sh apps` prints them; anything that is not a name is dropped. */
export function parsePackages(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(isPackageName);
}
