import { TAB_KEY } from './config';
import { hasBridge } from './ksu';
import { refreshPaths } from './paths';
import { loadStatus } from './status';
import { loadSystem } from './system';
import { loadSusSu } from './su';
import { loadTune, prefetchTune, reloadTune } from './tune';

const loaders: Record<string, () => Promise<void>> = {
  status: loadStatus,
  paths: refreshPaths,
  system: loadSystem,
  tune: loadTune,
  su: loadSusSu,
};

// Opening a tab may use cached values; pulling to refresh must read the kernel again.
const refreshers: Record<string, () => Promise<void>> = { ...loaders, tune: reloadTune };

/** Long enough for the page-in and the staggered card-in animations to finish. */
const ANIMATION_MS = 700;
/** Pause between background loads, so the shells they start never pile up. */
const PREFETCH_GAP_MS = 150;

let activeTab = 'status';
let refreshTimer: number | undefined;
const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

/** Runs a page loader, sharing a load that is already under way instead of starting another. */
function load(name: string): Promise<void> {
  const running = inflight.get(name);
  if (running) return running;
  const loader = loaders[name];
  if (!loader) return Promise.resolve();

  const task = loader()
    .then(() => {
      loaded.add(name);
    })
    .catch(() => undefined)
    .finally(() => {
      inflight.delete(name);
    });
  inflight.set(name, task);
  return task;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 2000 });
  } else {
    window.setTimeout(task, 400);
  }
}

/**
 * Loads every page in the background once the first screen is painted, one after another, so
 * opening a tab later shows data at once instead of starting shells in the middle of an animation.
 */
export function prefetchPages(): void {
  if (!hasBridge()) return;
  whenIdle(() => {
    void (async () => {
      for (const name of Object.keys(loaders)) {
        if (name === 'tune') continue;
        if (!loaded.has(name)) await load(name);
        await pause(PREFETCH_GAP_MS);
      }
      prefetchTune();
    })();
  });
}

export function refreshCurrentPage(): Promise<void> {
  if (!hasBridge()) return Promise.resolve();
  const refresh = refreshers[activeTab];
  return refresh ? refresh() : Promise.resolve();
}

function loadPage(name: string): void {
  if (!hasBridge()) return;
  window.clearTimeout(refreshTimer);

  if (loaded.has(name)) {
    // The page already shows what the background load read; refresh quietly once the animation ends.
    refreshTimer = window.setTimeout(() => {
      if (activeTab === name) void load(name);
    }, ANIMATION_MS);
    return;
  }
  // Wait a frame so the first animation frames are not held up by starting a shell.
  requestAnimationFrame(() => {
    if (activeTab === name) void load(name);
  });
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
