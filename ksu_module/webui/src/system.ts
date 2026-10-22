import { buildBatteryChips, buildChargeChips, bypassOf, parseInfo } from './chargeFormat';
import { createChipList, type ChipList } from './chipList';
import { BIN, CHARGE, confFile, quote } from './config';
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

let batteryChips: ChipList | undefined;
let chargeChips: ChipList | undefined;
let bypassPath = '';
let bypassBusy = false;

function applyBypass(found: { path: string; on: boolean } | undefined): void {
  const toggle = byId<SwitchElement>('bypassSwitch');
  const chip = byId('bypassState');
  bypassPath = found?.path ?? '';

  if (!found) {
    toggle.checked = false;
    toggle.disabled = true;
    chip.textContent = 'ядро без bypass_charging';
    chip.className = 'chip off';
    chip.hidden = false;
    return;
  }

  chip.hidden = true;
  // While a change is in flight the switch belongs to setBypass, not to the refresh.
  if (bypassBusy) return;
  toggle.disabled = false;
  toggle.checked = found.on;
}

/**
 * Reads the battery, the charger and the bypass switch with one root shell. Starting a shell is
 * what costs time on the device, so everything live on the System tab shares this single call.
 */
export async function loadLive(): Promise<void> {
  const { stdout } = await exec(`${quote(CHARGE)} info`);
  const info = parseInfo(stdout);

  batteryChips ??= createChipList(byId('batteryInfo'));
  chargeChips ??= createChipList(byId('chargeInfo'));
  batteryChips.update(buildBatteryChips(info));
  chargeChips.update(buildChargeChips(info));
  applyBypass(bypassOf(info));
}

export async function setBypass(on: boolean): Promise<void> {
  const toggle = byId<SwitchElement>('bypassSwitch');
  if (!bypassPath) {
    toggle.checked = !on;
    return;
  }

  bypassBusy = true;
  toggle.disabled = true;
  try {
    const applied = await run(
      `printf '%s' ${on ? 1 : 0} > ${quote(bypassPath)}`,
      on ? 'Обходная зарядка включена' : 'Обходная зарядка выключена',
    );
    if (applied.errno !== 0) {
      toggle.checked = !on;
      return;
    }
    await run(`printf '%s' ${on ? 1 : 0} > ${confFile('bypass')}`);
  } finally {
    bypassBusy = false;
    toggle.disabled = false;
  }
  await loadLive();
}

const LIVE_POLL_MS = 2000;
let livePollBusy = false;

/**
 * Keeps the battery and charging cards live while the System tab is open. It skips a tick when
 * the tab or the whole page is hidden, and never overlaps with a slow previous read.
 */
export function startLivePolling(): void {
  const page = document.querySelector<HTMLElement>('.page[data-page="system"]');
  if (!page) return;

  setInterval(() => {
    if (page.hidden || document.hidden || livePollBusy) return;
    livePollBusy = true;
    void loadLive()
      .catch(() => undefined)
      .finally(() => {
        livePollBusy = false;
      });
  }, LIVE_POLL_MS);
}

export async function loadSystem(): Promise<void> {
  await Promise.all([loadLog(), loadLive()]);
}
