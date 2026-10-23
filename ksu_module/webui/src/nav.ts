import { TAB_KEY } from './core/config';
import { hasBridge } from './core/ksu';
import { refreshPaths } from './pages/paths';
import { loadStatus } from './pages/status';
import { loadSusSu } from './pages/su';
import { loadSystem } from './pages/system';
import { discardUname, hasUnsavedUname, loadUname, saveUname } from './pages/uname';
import { discardTune, hasUnsavedTune, loadTune, prefetchTune, reloadTune, saveTune } from './pages/tune';
import { hidePageSkeletons, showPageSkeletons } from './ui/skeleton';
import { askUnsaved } from './ui/unsavedDialog';

const loaders: Record<string, () => Promise<void>> = {
  status: loadStatus,
  paths: refreshPaths,
  system: loadSystem,
  tune: loadTune,
  su: () => Promise.all([loadSusSu(), loadUname()]).then(() => undefined),
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
      // Success or failure, the placeholders have done their job; the page shows what it has.
      hidePageSkeletons(name);
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
  // Nothing to show yet: placeholders stand in until the data arrives. They are only built for a
  // tab that is opened before its background load finished, so a prefetched tab never shows them.
  showPageSkeletons(name);
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

/** A tab that keeps edits until the user saves them. */
interface TabGuard {
  hasUnsaved(): boolean;
  /** Resolves to true when everything was saved, false when the user has to stay and look. */
  save(): Promise<boolean>;
  discard(): void | Promise<void>;
}

const guards: Readonly<Record<string, TabGuard>> = {
  tune: { hasUnsaved: hasUnsavedTune, save: saveTune, discard: discardTune },
  su: { hasUnsaved: hasUnsavedUname, save: saveUname, discard: discardUname },
};

let asking = false;

/**
 * Opens a tab on the user's request. Leaving a tab that has unsaved edits (Tuning, or the kernel
 * version on SU) asks first: save them, drop them, or stay. A tap on a tab while that question is
 * open is ignored.
 */
export async function requestPage(name: string): Promise<void> {
  if (asking) return;
  const guard = guards[activeTab];
  if (guard && name !== activeTab && guard.hasUnsaved()) {
    asking = true;
    try {
      const choice = await askUnsaved();
      if (choice === 'stay') return;
      if (choice === 'save') {
        // A failed save keeps the edits, so the user stays and sees what was not applied.
        if (!(await guard.save())) return;
      } else {
        await guard.discard();
      }
    } finally {
      asking = false;
    }
  }
  showPage(name);
}

export function savedTab(): string {
  try {
    return sessionStorage.getItem(TAB_KEY) ?? 'status';
  } catch {
    return 'status';
  }
}
