/** Drag distance that turns the loading indicator one full revolution, as in the M3E example. */
export const PULL_DISTANCE_PER_TURN = 120;
/** Drag distance at which letting go starts a refresh. */
export const TRIGGER_DISTANCE = 96;
/** The indicator follows the finger at half speed and stops here. */
export const MAX_OFFSET = 88;
/** Movement below this many pixels is treated as a tap, not a pull. */
export const DEAD_ZONE = 8;

const RESISTANCE = 0.5;
const FADE_IN_OFFSET = 40;

export function pullProgress(dy: number): number {
  return dy > 0 ? dy / PULL_DISTANCE_PER_TURN : 0;
}

export function indicatorOffset(dy: number): number {
  return Math.min(MAX_OFFSET, Math.max(0, dy) * RESISTANCE);
}

export function indicatorOpacity(dy: number): number {
  return Math.min(1, indicatorOffset(dy) / FADE_IN_OFFSET);
}

export function shouldRefresh(dy: number): boolean {
  return dy >= TRIGGER_DISTANCE;
}

export function exceedsDeadZone(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DEAD_ZONE;
}

/** A pull is a mostly vertical drag downwards; horizontal swipes and upward drags are left alone. */
export function startsPull(dx: number, dy: number): boolean {
  return dy > 0 && dy > Math.abs(dx);
}
