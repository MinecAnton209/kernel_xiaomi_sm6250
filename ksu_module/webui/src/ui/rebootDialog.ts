import { byId } from '../core/dom';
import { t } from '../logic/i18n';
import { showDialog } from './dialog';

export type RebootReason = 'module' | 'kernel' | 'device';

const BODY_KEYS = {
  module: 'reboot.bodyModule',
  kernel: 'reboot.bodyKernel',
  device: 'reboot.bodyDevice',
} as const satisfies Record<RebootReason, string>;

/**
 * Asks whether to reboot now, after something was installed that only a reboot puts to work.
 * Only the Reboot button says yes; closing the dialog any other way means later.
 */
export async function askReboot(reason: RebootReason): Promise<boolean> {
  byId('rebootDialogBody').textContent = t(BODY_KEYS[reason]);
  return (await showDialog('rebootDialog', 'later')) === 'reboot';
}
