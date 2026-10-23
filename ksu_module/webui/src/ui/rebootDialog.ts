import { byId } from '../core/dom';
import { t } from '../logic/i18n';
import { showDialog } from './dialog';

export type RebootReason = 'module' | 'kernel';

/**
 * Asks whether to reboot now, after something was installed that only a reboot puts to work.
 * Only the Reboot button says yes; closing the dialog any other way means later.
 */
export async function askReboot(reason: RebootReason): Promise<boolean> {
  byId('rebootDialogBody').textContent = t(reason === 'kernel' ? 'reboot.bodyKernel' : 'reboot.bodyModule');
  return (await showDialog('rebootDialog', 'later')) === 'reboot';
}
