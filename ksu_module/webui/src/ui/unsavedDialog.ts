import { toUnsavedChoice, type UnsavedChoice } from '../logic/tuneEdits';
import { showDialog } from './dialog';

/** Asks what to do with unsaved changes; closing the dialog without an answer counts as staying. */
export async function askUnsaved(): Promise<UnsavedChoice> {
  return toUnsavedChoice(await showDialog('unsavedDialog', 'stay'));
}
