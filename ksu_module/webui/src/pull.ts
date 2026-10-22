import { byId } from './dom';
import {
  exceedsDeadZone,
  indicatorOffset,
  indicatorOpacity,
  pullProgress,
  shouldRefresh,
  startsPull,
} from './pullMath';

type PullIndicator = HTMLElement & { pullProgress: number | null };

/** Where the indicator rests while the refresh runs. */
const REFRESH_OFFSET = 56;
/** Keeps the spinner visible long enough to read even when the refresh is instant. */
const MIN_SPIN_MS = 600;

function atTop(): boolean {
  return (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull to refresh with the M3E loading indicator. The gesture is built on touch events and not
 * on m3e-pan-gesture: pointer events are cancelled as soon as the browser starts scrolling, so
 * a pan gesture never sees a drag that begins on a scrollable page.
 */
export function initPullToRefresh(refresh: () => Promise<void>): void {
  const zone = byId('ptr');
  const indicator = byId<PullIndicator>('ptrIndicator');

  let startX = 0;
  let startY = 0;
  let lastDy = 0;
  let tracking = false;
  let pulling = false;
  let refreshing = false;

  const place = (offset: number, opacity: number): void => {
    zone.style.setProperty('--ptr-offset', `${offset}px`);
    zone.style.setProperty('--ptr-opacity', String(opacity));
  };

  const hide = (): void => {
    indicator.pullProgress = null;
    place(0, 0);
  };

  const finish = async (): Promise<void> => {
    const trigger = shouldRefresh(lastDy);
    tracking = false;
    pulling = false;
    zone.classList.remove('dragging');

    if (!trigger) {
      hide();
      return;
    }

    refreshing = true;
    indicator.pullProgress = null;
    place(REFRESH_OFFSET, 1);
    try {
      await Promise.all([refresh(), sleep(MIN_SPIN_MS)]);
    } catch {
      // Each page reports its own errors; the gesture only has to stop spinning.
    } finally {
      refreshing = false;
      hide();
    }
  };

  document.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      tracking = !refreshing && event.touches.length === 1 && touch !== undefined && atTop();
      pulling = false;
      lastDy = 0;
      if (tracking && touch) {
        startX = touch.clientX;
        startY = touch.clientY;
      }
    },
    { passive: true },
  );

  // Not passive: once a pull starts, preventDefault keeps the WebView's own overscroll away.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!pulling) {
        if (!exceedsDeadZone(dx, dy)) return;
        if (!startsPull(dx, dy) || !atTop()) {
          tracking = false;
          return;
        }
        pulling = true;
        zone.classList.add('dragging');
      }

      lastDy = dy;
      if (event.cancelable) event.preventDefault();
      indicator.pullProgress = pullProgress(dy);
      place(indicatorOffset(dy), indicatorOpacity(dy));
    },
    { passive: false },
  );

  const end = (): void => {
    if (pulling) void finish();
    tracking = false;
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener(
    'touchcancel',
    () => {
      lastDy = 0;
      end();
    },
    { passive: true },
  );
}
