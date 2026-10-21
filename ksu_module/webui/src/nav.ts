import { TAB_KEY } from './config';
import { hasBridge } from './ksu';
import { refreshPaths } from './paths';
import { loadStatus } from './status';
import { loadLog } from './system';
import { loadSusSu } from './su';

const loaders: Record<string, () => Promise<void>> = {
  status: loadStatus,
  paths: refreshPaths,
  system: loadLog,
  su: loadSusSu,
};

function loadPage(name: string): void {
  if (!hasBridge()) return;
  const load = loaders[name];
  if (load) void load();
}

export function showPage(name: string): void {
  document.querySelectorAll<HTMLElement>('.page').forEach((page) => {
    page.hidden = page.dataset['page'] !== name;
  });
  document.querySelectorAll<HTMLElement>('.nav-item').forEach((button) => {
    const active = button.dataset['tab'] === name;
    button.classList.toggle('active', active);
    if (active) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
  try {
    sessionStorage.setItem(TAB_KEY, name);
  } catch {
    // sessionStorage can be blocked in the manager WebView; the tab just won't persist.
  }
  loadPage(name);
}

export function savedTab(): string {
  try {
    return sessionStorage.getItem(TAB_KEY) ?? 'status';
  } catch {
    return 'status';
  }
}
