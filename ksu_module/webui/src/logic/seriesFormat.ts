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
    if (fields[1]) point.cpu = Number(fields[1]);
    if (fields[2]) point.gpu = Number(fields[2]);
    if (fields[3]) point.battery = Number(fields[3]);
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

/**
 * Columns for uPlot: the time axis first, then one column per series in the order asked for.
 * A bucket without a value becomes null, which uPlot draws as a gap rather than a line to zero.
 */
export function toColumns(points: readonly SeriesPoint[], keys: readonly SeriesKey[]): (number | null)[][] {
  const time: number[] = points.map((point) => point.ts);
  const columns = keys.map((key) => points.map((point) => point[key] ?? null));
  return [time, ...columns];
}

/** All values of the given series, for choosing the y range. */
export function valuesOf(points: readonly SeriesPoint[], keys: readonly SeriesKey[]): number[] {
  return points.flatMap((point) => keys.map((key) => point[key]).filter((value): value is number => value !== undefined));
}
