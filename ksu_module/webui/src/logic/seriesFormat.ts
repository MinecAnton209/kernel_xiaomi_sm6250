export interface SeriesPoint {
  ts: number;
  cpu?: number;
  gpu?: number;
  battery?: number;
}

export type SeriesKey = 'cpu' | 'gpu' | 'battery';

export const SERIES_KEYS: readonly SeriesKey[] = ['cpu', 'gpu', 'battery'];

/** Reads `kc_logger series` output: bucket time, CPU temperature, GPU temperature, battery temperature, then three values the chart does not draw. */
export function parseSeries(text: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const line of text.split('\n')) {
    const fields = line.split('|');
    const ts = Number(fields[0]);
    if (fields[0] === undefined || fields[0] === '' || !Number.isFinite(ts)) continue;
    const point: SeriesPoint = { ts };
    const cpu = Number(fields[1]);
    const gpu = Number(fields[2]);
    const battery = Number(fields[3]);
    if (fields[1]) point.cpu = cpu;
    if (fields[2]) point.gpu = gpu;
    if (fields[3]) point.battery = battery;
    points.push(point);
  }
  return points.sort((a, b) => a.ts - b.ts);
}

/** A y range that holds every value with a little air, and that is never narrower than 10 degrees. */
export function yDomain(values: readonly number[]): [number, number] {
  if (values.length === 0) return [20, 60];
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < 10) {
    const middle = (high + low) / 2;
    low = middle - 5;
    high = middle + 5;
  }
  return [Math.floor(low - 2), Math.ceil(high + 2)];
}

export interface Geometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Plotted {
  key: SeriesKey;
  /** One path per run of unbroken values, so a missing bucket leaves a gap rather than a line to zero. */
  paths: string[];
  last?: number;
}

/** Maps the points onto the plot area; time runs left to right from the first point to the last one. */
export function plot(points: readonly SeriesPoint[], keys: readonly SeriesKey[], [low, high]: [number, number], geometry: Geometry): Plotted[] {
  const first = points[0]?.ts ?? 0;
  const last = points[points.length - 1]?.ts ?? first;
  const span = Math.max(1, last - first);
  const plotWidth = geometry.width - geometry.left - geometry.right;
  const plotHeight = geometry.height - geometry.top - geometry.bottom;

  const x = (ts: number): number => geometry.left + ((ts - first) / span) * plotWidth;
  const y = (value: number): number => geometry.top + (1 - (value - low) / (high - low)) * plotHeight;

  return keys.map((key) => {
    const paths: string[] = [];
    let current: string[] = [];
    for (const point of points) {
      const value = point[key];
      if (value === undefined) {
        if (current.length > 0) paths.push(`M${current.join('L')}`);
        current = [];
        continue;
      }
      current.push(`${x(point.ts).toFixed(1)},${y(value).toFixed(1)}`);
    }
    if (current.length > 0) paths.push(`M${current.join('L')}`);
    const lastValue = [...points].reverse().find((point) => point[key] !== undefined)?.[key];
    return { key, paths, last: lastValue };
  });
}

/** The point nearest to a time, so a pointer over the chart can show the values under it. */
export function nearestPoint(points: readonly SeriesPoint[], ts: number): SeriesPoint | undefined {
  let best: SeriesPoint | undefined;
  for (const point of points) {
    if (best === undefined || Math.abs(point.ts - ts) < Math.abs(best.ts - ts)) best = point;
  }
  return best;
}
