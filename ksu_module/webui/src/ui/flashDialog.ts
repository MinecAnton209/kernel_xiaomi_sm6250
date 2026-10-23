import { byId } from '../core/dom';
import { t } from '../logic/i18n';
import { showDialog } from './dialog';

/**
 * Asks before a kernel is written to the boot partition, and says whether the file will be checked
 * against a known SHA-256. Only the Flash button says yes; closing the dialog any other way means no.
 */
export async function confirmFlash(fileName: string, checksumKnown: boolean): Promise<boolean> {
  const checksum = t(checksumKnown ? 'flash.confirmChecksum' : 'flash.confirmNoChecksum');
  byId('flashDialogBody').textContent = `${t('flash.confirmBody', { file: fileName })} ${checksum}`;
  return (await showDialog('flashDialog', 'cancel')) === 'flash';
}
