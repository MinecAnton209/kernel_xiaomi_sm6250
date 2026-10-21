import { byId } from './dom';

let hideTimer: number | undefined;

export function toast(message: string): void {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
}
