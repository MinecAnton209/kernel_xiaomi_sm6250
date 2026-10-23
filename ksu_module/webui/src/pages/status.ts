import { BIN, quote } from '../core/config';
import { byId } from '../core/dom';
import { exec } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { t } from '../logic/i18n';
import { buildLabel, featureSpecs } from '../logic/statusFormat';
import { createChipList, type ChipList } from '../ui/chipList';

let featureChips: ChipList | undefined;

export async function loadStatus(): Promise<void> {
  const { stdout } = await exec(
    joinCommands([
      'uname -r',
      `${quote(BIN)} show_version`,
      `${quote(BIN)} show_variant`,
      `${quote(BIN)} show_features`,
      `${quote(BIN)} show_build`,
    ]),
  );
  const [kernel = '', version = '', variant = '', features = '', build = ''] = splitSections(stdout);

  byId('kernel').textContent = t('status.kernel', { version: kernel });

  const buildChip = byId('build');
  const label = buildLabel(build);
  buildChip.hidden = label === undefined;
  buildChip.textContent = label === undefined ? '' : t('status.build', { build: label });

  const susfs = byId('susfs');
  if (version) {
    susfs.textContent = `SUSFS ${version} (${variant})`;
    susfs.className = 'chip ok';
  } else {
    susfs.textContent = t('status.susfsNoReply');
    susfs.className = 'chip off';
  }

  featureChips ??= createChipList(byId('features'));
  featureChips.update(featureSpecs(features));
}
