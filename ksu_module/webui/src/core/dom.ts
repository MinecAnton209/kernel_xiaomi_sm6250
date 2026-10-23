export type Togglable = HTMLElement & { disabled: boolean };
export type SwitchElement = HTMLElement & { checked: boolean; disabled: boolean };
/** The part of m3e-select the pages use; its value is a string in single-select mode. */
export type SelectElement = HTMLElement & { value: string; disabled: boolean };

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

export async function busy(el: Togglable, task: () => Promise<void>): Promise<void> {
  el.disabled = true;
  try {
    await task();
  } finally {
    el.disabled = false;
  }
}
