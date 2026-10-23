import { t } from './i18n.ts';

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
  if (type) chips.push({ key: 'type', text: t('charge.type', { value: type }), state: '' });

  const pd = info.get('usb_pd_active');
  if (pd !== undefined) {
    chips.push({ key: 'pd', text: pd === '1' ? t('charge.pdOn') : t('charge.pdOff'), state: pd === '1' ? 'ok' : 'off' });
  }

  const inputLimit = number(info, 'usb_input_limit');
  if (inputLimit !== undefined) {
    chips.push({ key: 'input-limit', text: t('charge.inputLimit', { value: Math.round(inputLimit / 1000) }), state: '' });
  }

  const usbVoltage = number(info, 'usb_voltage');
  if (usbVoltage !== undefined) {
    chips.push({ key: 'usb-voltage', text: t('charge.inputVoltage', { value: (usbVoltage / 1e6).toFixed(2) }), state: '' });
  }

  const fccMax = number(info, 'batt_fcc_max');
  if (fccMax !== undefined) {
    chips.push({ key: 'fcc-max', text: t('charge.batteryLimit', { value: (fccMax / 1e6).toFixed(2) }), state: '' });
  }

  const level = number(info, 'batt_thermal_level');
  if (level !== undefined) {
    chips.push({ key: 'thermal-level', text: t('charge.thermalLevel', { value: level }), state: level === 0 ? 'ok' : '' });
  }

  const chargeType = info.get('batt_charge_type');
  if (chargeType) chips.push({ key: 'charge-type', text: t('charge.mode', { value: chargeType }), state: '' });

  const chargerTemp = number(info, 'batt_charger_temp');
  if (chargerTemp !== undefined) {
    chips.push({ key: 'charger-temp', text: t('charge.chargerTemp', { value: (chargerTemp / 10).toFixed(1) }), state: '' });
  }

  const voltage = number(info, 'batt_voltage');
  const current = number(info, 'batt_current');
  if (voltage !== undefined && current !== undefined && current < 0) {
    const watts = (voltage * -current) / 1e12;
    chips.push({ key: 'power', text: t('charge.power', { value: watts.toFixed(1) }), state: '' });
  }

  if (chips.length === 0) chips.push({ key: 'empty', text: t('charge.empty'), state: 'off' });
  return chips;
}

/** The four battery chips. Each falls back to "no data", so the layout never jumps. */
export function buildBatteryChips(info: Map<string, string>): ChipSpec[] {
  const status = info.get('batt_status');
  const current = number(info, 'batt_current');
  const capacity = info.get('batt_capacity');
  const temp = number(info, 'batt_temp');
  const noData = t('common.noData');

  return [
    { key: 'status', text: t('battery.status', { value: status || noData }), state: status ? '' : 'off' },
    {
      key: 'current',
      text: t('battery.current', {
        value: current !== undefined ? t('battery.currentValue', { value: Math.round(current / 1000) }) : noData,
      }),
      state: current !== undefined ? '' : 'off',
    },
    {
      key: 'capacity',
      text: t('battery.capacity', { value: capacity ? t('battery.capacityValue', { value: capacity }) : noData }),
      state: capacity ? '' : 'off',
    },
    {
      key: 'temp',
      text: t('battery.temperature', {
        value: temp !== undefined ? t('battery.temperatureValue', { value: (temp / 10).toFixed(1) }) : noData,
      }),
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
