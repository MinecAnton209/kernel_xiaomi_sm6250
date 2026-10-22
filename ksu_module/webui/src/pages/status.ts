import { BIN, quote } from '../core/config';
import { byId } from '../core/dom';
import { exec } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { featureSpecs } from '../logic/statusFormat';
import { createChipList, type ChipList } from '../ui/chipList';

let featureChips: ChipList | undefined;

export async function loadStatus(): Promise<void> {
  const { stdout } = await exec(
    joinCommands([
      'uname -r',
      `${quote(BIN)} show_version`,
      `${quote(BIN)} show_variant`,
      `${quote(BIN)} show_features`,
    ]),
  );
  const [kernel = '', version = '', variant = '', features = ''] = splitSections(stdout);

  byId('kernel').textContent = `ядро: ${kernel}`;

  const susfs = byId('susfs');
  if (version) {
    susfs.textContent = `SUSFS ${version} (${variant})`;
    susfs.className = 'chip ok';
  } else {
    susfs.textContent = 'SUSFS: нет ответа от ядра';
    susfs.className = 'chip off';
  }

  featureChips ??= createChipList(byId('features'));
  featureChips.update(featureSpecs(features));
}
