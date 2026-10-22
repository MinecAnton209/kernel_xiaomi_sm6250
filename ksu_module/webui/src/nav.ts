import { TAB_KEY } from './config';
import { hasBridge } from './ksu';
import { refreshPaths } from './paths';
import { loadStatus } from './status';
import { loadSystem } from './system';
import { loadSusSu } from './su';
import { loadTune, reloadTune } from './tune';

const loaders: Record<string, () => Promise<void>> = {
  status: loadStatus,
  paths: refreshPaths,
  system: loadSystem,
  tune: loadTune,
  su: loadSusSu,
};

// Opening a tab may use cached values; pulling to refresh must read the kernel again.
const refreshers: Record<string, () => Promise<void>> = { ...loaders, tune: reloadTune };

let activeTab = 'status';

export function refreshCurrentPage(): Promise<void> {
  if (!hasBridge()) return Promise.resolve();
  const refresh = refreshers[activeTab];
  return refresh ? refresh() : Promise.resolve();
}

function loadPage(name: string): void {
  if (!hasBridge()) return;
  const load = loaders[name];
  if (load) void load();
}

export function showPage(name: string): void {
  activeTab = name;
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
