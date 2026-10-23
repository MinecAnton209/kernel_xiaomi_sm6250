import { byId } from '../core/dom';
import { toUnsavedChoice, type UnsavedChoice } from '../logic/tuneEdits';

/** The part of m3e-dialog used here; `returnValue` is the return-value of the action that was pressed. */
interface DialogElement extends HTMLElement {
  returnValue: string;
  show(): void;
}

/**
 * Asks what to do with unsaved changes. Pressing the backdrop or Escape closes the dialog without
 * an action, which counts as staying, so a stray tap never throws edits away.
 */
export function askUnsaved(): Promise<UnsavedChoice> {
  const dialog = byId<DialogElement>('unsavedDialog');
  dialog.returnValue = 'stay';
  return new Promise((resolve) => {
    dialog.addEventListener('closed', () => resolve(toUnsavedChoice(dialog.returnValue)), { once: true });
    dialog.show();
  });
}
