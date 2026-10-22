export interface Progress {
  done: number;
  total: number;
  /** Bytes received so far by each parallel part; empty for a single stream or an old fetch.sh. */
  parts: number[];
}

export type BarState =
  | { mode: 'query' }
  | { mode: 'indeterminate' }
  | { mode: 'buffer'; value: number; buffer: number };

function count(token: string | undefined): number {
  const value = Number(token);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Parses the contents of fetch.sh's `.progress` file: `<done> <total> [<part> ...]`. */
export function parseProgress(raw: string): Progress {
  const tokens = raw.trim().split(/\s+/).filter((token) => token !== '');
  return { done: count(tokens[0]), total: count(tokens[1]), parts: tokens.slice(2).map(count) };
}

/** How many bytes part `index` of `threads` is responsible for; mirrors the split in fetch.sh. */
export function partRange(index: number, total: number, threads: number): number {
  if (total <= 0 || threads <= 0) return 0;
  const size = Math.ceil(total / threads);
  const start = index * size;
  return Math.max(0, Math.min(total, start + size) - start);
}

/**
 * Completion of the slowest part, from 0 to 1. The file is only usable once every part is
 * complete, so this is the share that is certain, while the bytes received overall run ahead of it.
 */
export function slowestFraction(parts: readonly number[], total: number, threads: number): number {
  let slowest: number | undefined;
  parts.forEach((bytes, index) => {
    const range = partRange(index, total, threads);
    if (range === 0) return;
    const fraction = Math.min(1, bytes / range);
    slowest = slowest === undefined ? fraction : Math.min(slowest, fraction);
  });
  return slowest ?? 0;
}

function percent(fraction: number): number {
  return Math.min(100, Math.max(0, fraction * 100));
}

/**
 * Query while connecting, indeterminate when the size is unknown, buffer while the size is known:
 * the buffer shows everything received and the main bar the slowest part.
 */
export function barState(progress: Progress, threads: number): BarState {
  if (progress.total <= 0) {
    return progress.done > 0 ? { mode: 'indeterminate' } : { mode: 'query' };
  }
  const buffer = percent(progress.done / progress.total);
  const value =
    progress.parts.length > 1 ? percent(slowestFraction(progress.parts, progress.total, threads)) : buffer;
  return { mode: 'buffer', value: Math.min(value, buffer), buffer };
}
