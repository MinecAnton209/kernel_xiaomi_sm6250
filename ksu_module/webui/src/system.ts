import { loadCharge } from './charge';
import { BIN, confFile, quote } from './config';
import { byId, type SwitchElement } from './dom';
import { exec, run } from './ksu';

export async function loadLog(): Promise<void> {
  const saved = (await exec(`cat ${confFile('log')} 2>/dev/null`)).stdout.trim();
  byId<SwitchElement>('logSwitch').checked = saved !== '0';
}

export async function setLog(on: boolean): Promise<void> {
  await run(`printf '%s' ${on ? 1 : 0} > ${confFile('log')}`);
  await run(`${quote(BIN)} enable_log ${on ? 1 : 0}`, on ? 'Лог включён' : 'Лог выключен');
}

export async function runUmount(): Promise<void> {
  await run(`${quote(BIN)} run_umount`, 'Try umount выполнен');
}

const BATTERY = '/sys/class/power_supply/battery';

async function readSysfs(path: string): Promise<string> {
  return (await exec(`cat ${quote(path)} 2>/dev/null`)).stdout.trim();
}

function setChip(id: string, text: string, state: 'ok' | 'off' | ''): void {
  const chip = byId(id);
  chip.textContent = text;
  chip.className = state ? `chip ${state}` : 'chip';
}

async function bypassPath(): Promise<string> {
  return (await exec(`cat ${confFile('bypass_path')} 2>/dev/null`)).stdout.trim();
}

export async function loadBypass(): Promise<void> {
  const toggle = byId<SwitchElement>('bypassSwitch');
  const path = await bypassPath();

  const chip = byId('bypassState');

  if (!path) {
    toggle.checked = false;
    toggle.disabled = true;
    setChip('bypassState', 'ядро без bypass_charging', 'off');
    chip.hidden = false;
    return;
  }

  const on = (await readSysfs(path)) === '1';
  toggle.disabled = false;
  toggle.checked = on;
  chip.hidden = true;
}

export async function setBypass(on: boolean): Promise<void> {
  const toggle = byId<SwitchElement>('bypassSwitch');
  const path = await bypassPath();
  if (!path) return;

  toggle.disabled = true;
  try {
    const applied = await run(`printf '%s' ${on ? 1 : 0} > ${quote(path)}`, on ? 'Обходная зарядка включена' : 'Обходная зарядка выключена');
    if (applied.errno !== 0) {
      toggle.checked = !on;
      return;
    }
    await run(`printf '%s' ${on ? 1 : 0} > ${confFile('bypass')}`);
  } finally {
    toggle.disabled = false;
  }
  await loadBypass();
}

export async function loadBattery(): Promise<void> {
  const [status, current, capacity, temp] = await Promise.all([
    readSysfs(`${BATTERY}/status`),
    readSysfs(`${BATTERY}/current_now`),
    readSysfs(`${BATTERY}/capacity`),
    readSysfs(`${BATTERY}/temp`),
  ]);

  setChip('batteryStatus', status ? `статус: ${status}` : 'статус: нет данных', status ? '' : 'off');
  const milliamps = Number(current);
  setChip('batteryCurrent', Number.isFinite(milliamps) && current ? `ток: ${Math.round(milliamps / 1000)} мА` : 'ток: нет данных', current ? '' : 'off');
  setChip('batteryCapacity', capacity ? `заряд: ${capacity}%` : 'заряд: нет данных', capacity ? '' : 'off');
  const tenths = Number(temp);
  setChip('batteryTemp', Number.isFinite(tenths) && temp ? `температура: ${(tenths / 10).toFixed(1)} °C` : 'температура: нет данных', temp ? '' : 'off');
}

const BATTERY_POLL_MS = 2000;
let batteryPollBusy = false;

/**
 * Keeps the battery chips live while the System tab is open. It skips a tick when
 * the tab or the whole page is hidden, and never overlaps with a slow previous read.
 */
export function startBatteryPolling(): void {
  const page = document.querySelector<HTMLElement>('.page[data-page="system"]');
  if (!page) return;

  setInterval(() => {
    if (page.hidden || document.hidden || batteryPollBusy) return;
    batteryPollBusy = true;
    void Promise.all([loadBattery(), loadCharge()]).finally(() => {
      batteryPollBusy = false;
    });
  }, BATTERY_POLL_MS);
}

export async function loadSystem(): Promise<void> {
  await Promise.all([loadLog(), loadBypass(), loadBattery(), loadCharge()]);
}
