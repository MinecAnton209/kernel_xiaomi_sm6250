import { byId } from '../core/dom';
import { t } from '../logic/i18n';
import { showDialog } from './dialog';

/**
 * Asks before a kernel is written to the boot partition. Only the Flash button says yes; closing
 * the dialog any other way means no.
 */
export async function confirmFlash(fileName: string): Promise<boolean> {
  byId('flashDialogBody').textContent = t('flash.confirmBody', { file: fileName });
  return (await showDialog('flashDialog', 'cancel')) === 'flash';
}
