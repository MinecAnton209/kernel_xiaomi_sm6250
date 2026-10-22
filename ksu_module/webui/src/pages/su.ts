import { BIN, confFile, quote } from '../core/config';
import { byId, busy, type SwitchElement } from '../core/dom';
import { exec, run } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';

export async function loadSusSu(): Promise<void> {
  const { stdout } = await exec(
    joinCommands([`${quote(BIN)} show_sus_su_working_mode`, `${quote(BIN)} is_sus_su_ready`]),
  );
  const [mode = '', ready = ''] = splitSections(stdout);
  const toggle = byId<SwitchElement>('susSuSwitch');
  const modeChip = byId('susSuMode');
  const readyChip = byId('susSuReady');

  if (!mode) {
    toggle.checked = false;
    toggle.disabled = true;
    modeChip.textContent = 'ядро без sus_su';
    modeChip.className = 'chip off';
    readyChip.textContent = 'устройство: нет';
    readyChip.className = 'chip off';
    return;
  }

  const on = mode === '2';
  toggle.disabled = false;
  toggle.checked = on;
  modeChip.textContent = on ? 'режим: включён' : 'режим: выключен';
  modeChip.className = on ? 'chip ok' : 'chip off';

  const isReady = ready.startsWith('ready=1');
  readyChip.textContent = isReady ? 'устройство: готово' : 'устройство: нет';
  readyChip.className = isReady ? 'chip ok' : 'chip off';
}

export async function setSusSu(on: boolean): Promise<void> {
  const toggle = byId<SwitchElement>('susSuSwitch');
  await busy(toggle, async () => {
    const mode = on ? 2 : 0;
    const saved = await run(`printf '%s' ${mode} > ${confFile('sus_su')}`);
    if (saved.errno !== 0) return;
    const applied = await run(`${quote(BIN)} sus_su ${mode}`, on ? 'sus_su включён' : 'sus_su выключен');
    if (applied.errno !== 0) toggle.checked = !on;
    await loadSusSu();
  });
}
