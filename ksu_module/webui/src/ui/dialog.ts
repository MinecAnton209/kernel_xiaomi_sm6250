import { byId } from '../core/dom';

/** The part of m3e-dialog used here; `returnValue` is the return-value of the action that was pressed. */
interface DialogElement extends HTMLElement {
  returnValue: string;
  show(): void;
}

/**
 * Opens a dialog from index.html and resolves with the return-value of the action that closed it.
 * Pressing the backdrop or Escape closes it without an action, which resolves with `dismissed`,
 * so the caller decides what a stray tap means.
 */
export function showDialog(id: string, dismissed: string): Promise<string> {
  const dialog = byId<DialogElement>(id);
  dialog.returnValue = dismissed;
  return new Promise((resolve) => {
    dialog.addEventListener('closed', () => resolve(dialog.returnValue || dismissed), { once: true });
    dialog.show();
  });
}
