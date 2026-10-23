import type { MessageKey } from './i18n.ts';
import { MAX_APPS, isPackageName } from './uname.ts';

export type DeviceScope = 'apps' | 'all' | 'root' | 'selected';
export type DeviceGroup = 'identity' | 'soc' | 'cpu' | 'gpu' | 'memory';

/**
 * `label` is the kernel or property name the value ends up in, so the fields stay recognizable
 * without a translation for every one of them.
 */
export const DEVICE_FIELDS = [
  { key: 'brand', group: 'identity', type: 'text', maxLength: 32, label: 'ro.product.brand' },
  { key: 'manufacturer', group: 'identity', type: 'text', maxLength: 32, label: 'ro.product.manufacturer' },
  { key: 'model', group: 'identity', type: 'text', maxLength: 64, label: 'ro.product.model' },
  { key: 'device', group: 'identity', type: 'text', maxLength: 32, label: 'ro.product.device' },
  { key: 'product', group: 'identity', type: 'text', maxLength: 64, label: 'ro.product.name' },
  { key: 'board', group: 'identity', type: 'text', maxLength: 32, label: 'ro.product.board' },
  { key: 'hardware', group: 'identity', type: 'text', maxLength: 64, label: 'ro.hardware' },
  { key: 'soc_manufacturer', group: 'identity', type: 'text', maxLength: 32, label: 'ro.soc.manufacturer' },
  { key: 'soc_model', group: 'identity', type: 'text', maxLength: 32, label: 'ro.soc.model' },

  { key: 'soc_machine', group: 'soc', type: 'text', maxLength: 63, label: '/sys/devices/soc0/machine' },
  { key: 'soc_family', group: 'soc', type: 'text', maxLength: 63, label: '/sys/devices/soc0/family' },
  { key: 'soc_id', group: 'soc', type: 'text', maxLength: 63, label: '/sys/devices/soc0/soc_id' },
  { key: 'soc_revision', group: 'soc', type: 'text', maxLength: 63, label: '/sys/devices/soc0/revision' },

  { key: 'cpu_hardware', group: 'cpu', type: 'text', maxLength: 63, label: 'cpuinfo Hardware' },
  { key: 'cpu_processor', group: 'cpu', type: 'text', maxLength: 63, label: 'cpuinfo Processor' },
  { key: 'cpu_model_name', group: 'cpu', type: 'text', maxLength: 63, label: 'cpuinfo model name' },
  { key: 'cpu_implementer', group: 'cpu', type: 'u32', maxLength: 10, label: 'cpuinfo CPU implementer' },
  { key: 'cpu_architecture', group: 'cpu', type: 'u32', maxLength: 10, label: 'cpuinfo CPU architecture' },
  { key: 'cpu_variant', group: 'cpu', type: 'u32', maxLength: 10, label: 'cpuinfo CPU variant' },
  { key: 'cpu_part', group: 'cpu', type: 'u32', maxLength: 10, label: 'cpuinfo CPU part' },
  { key: 'cpu_revision', group: 'cpu', type: 'u32', maxLength: 10, label: 'cpuinfo CPU revision' },
  { key: 'cpu_max_freqs', group: 'cpu', type: 'freqs', maxLength: 160, label: 'cpufreq max, Hz per CPU' },

  { key: 'gpu_model', group: 'gpu', type: 'text', maxLength: 63, label: 'kgsl gpu_model' },
  { key: 'gpu_max_clk', group: 'gpu', type: 'u32', maxLength: 12, label: 'kgsl max_gpuclk' },
  { key: 'gl_renderer', group: 'gpu', type: 'text', maxLength: 128, label: 'GL_RENDERER' },
  { key: 'gl_vendor', group: 'gpu', type: 'text', maxLength: 64, label: 'GL_VENDOR' },

  { key: 'mem_total_kb', group: 'memory', type: 'u64', maxLength: 12, label: '/proc/meminfo MemTotal, kB' },
  { key: 'dt_model', group: 'memory', type: 'text', maxLength: 127, label: '/proc/device-tree/model' },
  { key: 'dt_compatible', group: 'memory', type: 'text', maxLength: 255, label: '/proc/device-tree/compatible' },
] as const;

export type DeviceField = (typeof DEVICE_FIELDS)[number];
export type DeviceKey = DeviceField['key'];

export const DEVICE_KEYS: readonly DeviceKey[] = DEVICE_FIELDS.map((field) => field.key);

export const DEVICE_GROUPS = [
  { id: 'identity', title: 'device.group.identity' },
  { id: 'soc', title: 'device.group.soc' },
  { id: 'cpu', title: 'device.group.cpu' },
  { id: 'gpu', title: 'device.group.gpu' },
  { id: 'memory', title: 'device.group.memory' },
] as const satisfies readonly { id: DeviceGroup; title: MessageKey }[];

export const CUSTOM_PROFILE = 'custom';

export interface DeviceReal {
  processor: string;
  hardware: string;
  gpu: string;
  memTotalKb: string;
  socMachine: string;
}

export interface DeviceState {
  supported: boolean;
  neozygisk: boolean;
  enabled: boolean;
  profile: string;
  scope: DeviceScope;
  apps: string[];
  props: boolean;
  zygisk: boolean;
  values: Record<string, string>;
  real: DeviceReal;
}

export interface DeviceForm {
  enabled: boolean;
  profile: string;
  scope: DeviceScope;
  apps: readonly string[];
  props: boolean;
  zygisk: boolean;
  values: Readonly<Record<string, string>>;
}

export interface DevicePreset {
  id: string;
  /** Shown as it is: these are model names, which are not translated. */
  label: string;
  values: Readonly<Record<DeviceKey, string>>;
}

const STOCK_VALUES: Record<DeviceKey, string> = {
  brand: 'Redmi',
  manufacturer: 'Xiaomi',
  model: 'Redmi Note 9 Pro',
  device: 'joyeuse',
  product: 'joyeuse_global',
  board: 'atoll',
  hardware: 'qcom',
  soc_manufacturer: 'Qualcomm',
  soc_model: 'SM7125',
  soc_machine: 'Qualcomm Technologies, Inc. SM7125',
  soc_family: 'Snapdragon 720G',
  soc_id: 'SM7125',
  soc_revision: 'v1.0',
  cpu_hardware: 'Qualcomm Technologies, Inc SM7125',
  cpu_processor: 'AArch64 Processor rev 1 (aarch64)',
  cpu_model_name: 'ARMv8 Processor rev 1 (v8l)',
  cpu_implementer: '0x41',
  cpu_architecture: '8',
  cpu_variant: '0x1',
  cpu_part: '0xd0b',
  cpu_revision: '1',
  cpu_max_freqs: '1800000 1800000 1800000 1800000 1800000 1800000 2300000 2300000',
  gpu_model: 'Adreno (TM) 618',
  gpu_max_clk: '750000000',
  gl_renderer: 'Adreno (TM) 618',
  gl_vendor: 'Qualcomm',
  mem_total_kb: '5700000',
  dt_model: 'Qualcomm Technologies, Inc. ATOLL MTP',
  dt_compatible: 'qcom,atoll-mtp',
};

function makePreset(id: string, label: string, overrides: Partial<Record<DeviceKey, string>>): DevicePreset {
  return { id, label, values: { ...STOCK_VALUES, ...overrides } };
}

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: 'redmi-note-9-pro', label: 'Redmi Note 9 Pro (stock)', values: STOCK_VALUES },
  makePreset('poco-x3-nfc', 'POCO X3 NFC', {
    brand: 'POCO',
    model: 'POCO X3 NFC',
    device: 'surya',
    product: 'surya_global',
    board: 'sm7150',
    soc_model: 'SM7150-AC',
    soc_machine: 'Qualcomm Technologies, Inc. SM7150',
    soc_family: 'Snapdragon 732G',
    soc_id: 'SM7150-AC',
    cpu_hardware: 'Qualcomm Technologies, Inc SM7150',
    dt_model: 'Xiaomi surya',
    dt_compatible: 'qcom,sm7150-mtp',
    mem_total_kb: '5700000',
  }),
  makePreset('redmi-note-10-pro', 'Redmi Note 10 Pro', {
    brand: 'Redmi',
    model: 'Redmi Note 10 Pro',
    device: 'sweet',
    product: 'sweet_global',
    board: 'sm7150',
    soc_model: 'SM7150-AB',
    soc_machine: 'Qualcomm Technologies, Inc. SM7150',
    soc_family: 'Snapdragon 732G',
    soc_id: 'SM7150-AB',
    cpu_hardware: 'Qualcomm Technologies, Inc SM7150',
    dt_model: 'Xiaomi sweet',
    dt_compatible: 'qcom,sm7150-mtp',
    mem_total_kb: '7600000',
  }),
  makePreset('pixel-6', 'Google Pixel 6', {
    brand: 'google',
    manufacturer: 'Google',
    model: 'Pixel 6',
    device: 'oriole',
    product: 'oriole',
    board: 'oriole',
    hardware: 'oriole',
    soc_manufacturer: 'Google',
    soc_model: 'Tensor',
    soc_machine: 'Google Tensor',
    soc_family: 'Google Tensor',
    soc_id: 'Tensor',
    soc_revision: 'v1.0',
    cpu_hardware: 'Google Tensor',
    cpu_model_name: 'ARMv8 Processor rev 1 (v8l)',
    cpu_part: '0xd44',
    cpu_max_freqs: '1800000 1800000 1800000 1800000 2250000 2250000 2800000 2800000',
    gpu_model: 'Mali-G78 MP20',
    gpu_max_clk: '848000000',
    gl_renderer: 'Mali-G78 MP20',
    gl_vendor: 'ARM',
    mem_total_kb: '7600000',
    dt_model: 'Google Pixel 6',
    dt_compatible: 'google,oriole',
  }),
  makePreset('galaxy-s21', 'Samsung Galaxy S21', {
    brand: 'samsung',
    manufacturer: 'samsung',
    model: 'SM-G991B',
    device: 'o1s',
    product: 'o1sxxx',
    board: 'exynos2100',
    hardware: 'exynos2100',
    soc_manufacturer: 'Samsung',
    soc_model: 'Exynos 2100',
    soc_machine: 'Exynos 2100',
    soc_family: 'Exynos 2100',
    soc_id: 'Exynos 2100',
    soc_revision: 'v1.0',
    cpu_hardware: 'Exynos 2100',
    cpu_model_name: 'ARMv8 Processor rev 1 (v8l)',
    cpu_part: '0xd44',
    cpu_max_freqs: '2000000 2000000 2000000 2000000 2400000 2400000 2900000 2900000',
    gpu_model: 'Mali-G78 MP14',
    gpu_max_clk: '854000000',
    gl_renderer: 'Mali-G78 MP14',
    gl_vendor: 'ARM',
    mem_total_kb: '7600000',
    dt_model: 'Samsung Galaxy S21',
    dt_compatible: 'samsung,exynos2100',
  }),
  makePreset('oneplus-9', 'OnePlus 9', {
    brand: 'OnePlus',
    manufacturer: 'OnePlus',
    model: 'LE2113',
    device: 'lemonade',
    product: 'OnePlus9',
    board: 'sm8350',
    hardware: 'qcom',
    soc_manufacturer: 'Qualcomm',
    soc_model: 'SM8350',
    soc_machine: 'Qualcomm Technologies, Inc. SM8350',
    soc_family: 'Snapdragon 888',
    soc_id: 'SM8350',
    soc_revision: 'v1.0',
    cpu_hardware: 'Qualcomm Technologies, Inc SM8350',
    cpu_model_name: 'ARMv8 Processor rev 1 (v8l)',
    cpu_part: '0xd44',
    cpu_max_freqs: '1800000 1800000 1800000 1800000 2400000 2400000 2400000 2840000',
    gpu_model: 'Adreno (TM) 660',
    gpu_max_clk: '840000000',
    gl_renderer: 'Adreno (TM) 660',
    gl_vendor: 'Qualcomm',
    mem_total_kb: '11400000',
    dt_model: 'OnePlus 9',
    dt_compatible: 'qcom,sm8350-mtp',
  }),
];

export function emptyDeviceState(): DeviceState {
  const values: Record<string, string> = {};
  for (const key of DEVICE_KEYS) values[key] = '';
  return {
    supported: false,
    neozygisk: false,
    enabled: false,
    profile: '',
    scope: 'apps',
    apps: [],
    props: false,
    zygisk: false,
    values,
    real: { processor: '', hardware: '', gpu: '', memTotalKb: '', socMachine: '' },
  };
}

function parseScope(value: string): DeviceScope {
  switch (value.trim()) {
    case 'all':
      return 'all';
    case 'root':
      return 'root';
    case 'selected':
      return 'selected';
    default:
      return 'apps';
  }
}

export function parseDevice(stdout: string): DeviceState {
  const state = emptyDeviceState();
  const fields = new Set<string>(DEVICE_KEYS);

  for (const line of stdout.split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at);
    const value = line.slice(at + 1).replace(/\r$/, '');
    switch (key) {
      case 'supported':
        state.supported = value.trim() === '1';
        break;
      case 'neozygisk':
        state.neozygisk = value.trim() === '1';
        break;
      case 'enabled':
        state.enabled = value.trim() === '1';
        break;
      case 'props':
        state.props = value.trim() === '1';
        break;
      case 'zygisk':
        state.zygisk = value.trim() === '1';
        break;
      case 'profile':
        state.profile = value.trim();
        break;
      case 'scope':
        state.scope = parseScope(value);
        break;
      case 'apps':
        state.apps = value.split(/\s+/).filter((app) => app !== '');
        break;
      case 'real_processor':
        state.real.processor = value.trim();
        break;
      case 'real_cpu_hardware':
        state.real.hardware = value.trim();
        break;
      case 'real_gpu':
        state.real.gpu = value.trim();
        break;
      case 'real_mem_total_kb':
        state.real.memTotalKb = value.trim();
        break;
      case 'real_soc_machine':
        state.real.socMachine = value.trim();
        break;
      default:
        if (fields.has(key)) state.values[key] = value;
        break;
    }
  }
  return state;
}

export function normalizeDeviceValues(values: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const field of DEVICE_FIELDS) {
    const value = (values[field.key] ?? '').trim();
    normalized[field.key] = field.type === 'freqs' ? value.replace(/[\s,]+/g, ' ').trim() : value;
  }
  return normalized;
}

export function matchProfile(values: Readonly<Record<string, string>>): string {
  const normalized = normalizeDeviceValues(values);
  const found = DEVICE_PRESETS.find((preset) => DEVICE_KEYS.every((key) => preset.values[key] === normalized[key]));
  return found ? found.id : CUSTOM_PROFILE;
}

export function validateDeviceText(value: string, maxLength: number): MessageKey | undefined {
  if (value === '') return undefined;
  if (value.length > maxLength || value === 'default' || value === '-' || !/^[ -~]+$/.test(value)) {
    return 'device.invalidText';
  }
  return undefined;
}

function isU32(value: string): boolean {
  return /^(0[xX][0-9A-Fa-f]+|[0-9]+)$/.test(value);
}

export function validateDeviceValues(values: Readonly<Record<string, string>>): MessageKey | undefined {
  const normalized = normalizeDeviceValues(values);
  for (const field of DEVICE_FIELDS) {
    const value = normalized[field.key] ?? '';
    if (value === '') continue;
    switch (field.type) {
      case 'text': {
        const problem = validateDeviceText(value, field.maxLength);
        if (problem) return problem;
        break;
      }
      case 'u32':
        if (!isU32(value)) return 'device.invalidNumber';
        break;
      case 'u64':
        if (!/^[0-9]+$/.test(value)) return 'device.invalidNumber';
        break;
      case 'freqs': {
        const parts = value.split(' ').filter((part) => part !== '');
        if (parts.length === 0 || parts.length > 16 || !parts.every(isU32)) return 'device.invalidFreqs';
        break;
      }
    }
  }
  return undefined;
}

export function validateDeviceApps(apps: readonly string[]): MessageKey | undefined {
  if (apps.length > MAX_APPS) return 'device.tooMany';
  const seen = new Set<string>();
  for (const app of apps) {
    if (!isPackageName(app)) return 'device.invalidPackage';
    if (seen.has(app)) return 'device.duplicate';
    seen.add(app);
  }
  return undefined;
}

export function devicePayload(form: DeviceForm): string {
  const values = normalizeDeviceValues(form.values);
  const lines = [
    `enabled=${form.enabled ? '1' : '0'}`,
    `profile=${form.profile}`,
    `scope=${form.scope}`,
    `apps=${form.apps.join(' ')}`,
    `props=${form.props ? '1' : '0'}`,
    `zygisk=${form.zygisk ? '1' : '0'}`,
  ];
  for (const field of DEVICE_FIELDS) lines.push(`${field.key}=${values[field.key] ?? ''}`);
  return lines.join('\n');
}

/** The memory the kernel reports, in the unit Android settings and benchmarks usually show. */
export function formatMemory(kilobytes: string): string {
  const kb = Number(kilobytes);
  if (!Number.isFinite(kb) || kb <= 0) return '';
  return `${(kb / 1048576).toFixed(1)} GB`;
}
