import { buildChargeChips, parseInfo } from './chargeFormat';
import { CHARGE, quote } from './config';
import { byId } from './dom';
import { exec } from './ksu';

export async function loadCharge(): Promise<void> {
  const { stdout } = await exec(`${quote(CHARGE)} info`);
  const nodes = buildChargeChips(parseInfo(stdout)).map(({ text, state }) => {
    const chip = document.createElement('span');
    chip.className = state ? `chip ${state}` : 'chip';
    chip.textContent = text;
    return chip;
  });
  byId('chargeInfo').replaceChildren(...nodes);
}
