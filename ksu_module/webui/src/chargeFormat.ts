export type ChipState = 'ok' | 'off' | '';

export interface ChipSpec {
  /** Stable identity, so a refresh can update a chip in place instead of replacing it. */
  key: string;
  text: string;
  state: ChipState;
}

export function parseInfo(stdout: string): Map<string, string> {
  const info = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) info.set(line.slice(0, at), line.slice(at + 1).trim());
  }
  return info;
}

function number(info: Map<string, string>, key: string): number | undefined {
  const raw = info.get(key);
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Turns the raw sysfs values from charge.sh into chips. Currents are in µA, voltages in µV
 * and temperatures in tenths of a degree, which is what the SMB5 driver reports.
 */
export function buildChargeChips(info: Map<string, string>): ChipSpec[] {
  const chips: ChipSpec[] = [];

  const type = info.get('usb_real_type');
  if (type) chips.push({ key: 'type', text: `зарядник: ${type}`, state: '' });

  const pd = info.get('usb_pd_active');
  if (pd !== undefined) {
    chips.push({ key: 'pd', text: pd === '1' ? 'PD: активен' : 'PD: нет', state: pd === '1' ? 'ok' : 'off' });
  }

  const inputLimit = number(info, 'usb_input_limit');
  if (inputLimit !== undefined) {
    chips.push({ key: 'input-limit', text: `лимит входа: ${Math.round(inputLimit / 1000)} мА`, state: '' });
  }

  const usbVoltage = number(info, 'usb_voltage');
  if (usbVoltage !== undefined) {
    chips.push({ key: 'usb-voltage', text: `напряжение входа: ${(usbVoltage / 1e6).toFixed(2)} В`, state: '' });
  }

  const fccMax = number(info, 'batt_fcc_max');
  if (fccMax !== undefined) {
    chips.push({ key: 'fcc-max', text: `лимит тока батареи: ${(fccMax / 1e6).toFixed(2)} А`, state: '' });
  }

  const level = number(info, 'batt_thermal_level');
  if (level !== undefined) {
    chips.push({ key: 'thermal-level', text: `температурный уровень: ${level}`, state: level === 0 ? 'ok' : '' });
  }

  const chargeType = info.get('batt_charge_type');
  if (chargeType) chips.push({ key: 'charge-type', text: `режим заряда: ${chargeType}`, state: '' });

  const chargerTemp = number(info, 'batt_charger_temp');
  if (chargerTemp !== undefined) {
    chips.push({ key: 'charger-temp', text: `температура зарядника: ${(chargerTemp / 10).toFixed(1)} °C`, state: '' });
  }

  const voltage = number(info, 'batt_voltage');
  const current = number(info, 'batt_current');
  if (voltage !== undefined && current !== undefined && current < 0) {
    const watts = (voltage * -current) / 1e12;
    chips.push({ key: 'power', text: `в батарею: ${watts.toFixed(1)} Вт`, state: '' });
  }

  if (chips.length === 0) chips.push({ key: 'empty', text: 'нет данных от драйвера зарядки', state: 'off' });
  return chips;
}

/** The four battery chips. Each falls back to "нет данных", so the layout never jumps. */
export function buildBatteryChips(info: Map<string, string>): ChipSpec[] {
  const status = info.get('batt_status');
  const current = number(info, 'batt_current');
  const capacity = info.get('batt_capacity');
  const temp = number(info, 'batt_temp');

  return [
    { key: 'status', text: status ? `статус: ${status}` : 'статус: нет данных', state: status ? '' : 'off' },
    {
      key: 'current',
      text: current !== undefined ? `ток: ${Math.round(current / 1000)} мА` : 'ток: нет данных',
      state: current !== undefined ? '' : 'off',
    },
    { key: 'capacity', text: capacity ? `заряд: ${capacity}%` : 'заряд: нет данных', state: capacity ? '' : 'off' },
    {
      key: 'temp',
      text: temp !== undefined ? `температура: ${(temp / 10).toFixed(1)} °C` : 'температура: нет данных',
      state: temp !== undefined ? '' : 'off',
    },
  ];
}

/** Where the kernel put bypass_charging and whether it is on; undefined when the kernel lacks it. */
export function bypassOf(info: Map<string, string>): { path: string; on: boolean } | undefined {
  const path = info.get('bypass_path');
  if (!path) return undefined;
  return { path, on: info.get('bypass') === '1' };
}
