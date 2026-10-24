import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { KC_LOGGER, LOGGER_DB, quote } from '../core/config';
import { byId, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { t, type MessageKey } from '../logic/i18n';
import { CHART_RANGES, type ChartRange } from '../logic/loggerFormat';
import {
  SERIES_KEYS,
  parseSeries,
  statsOf,
  toColumns,
  valuesOf,
  yDomain,
  type SeriesKey,
  type SeriesPoint,
  type SeriesStats,
} from '../logic/seriesFormat';

const CHART_HEIGHT = 220;

let range: ChartRange = CHART_RANGES[0];
let points: SeriesPoint[] = [];
let stats: Partial<Record<SeriesKey, SeriesStats>> = {};
let plot: uPlot | undefined;
let resizeObserver: ResizeObserver | undefined;

/** Reads a theme colour at draw time, so the chart follows the light or dark theme the page is in. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const SERIES_TOKEN: Record<SeriesKey, string> = {
  cpu: '--series-1',
  gpu: '--series-2',
  battery: '--series-3',
};

const SERIES_LABEL: Record<SeriesKey, MessageKey> = {
  cpu: 'history.cpu',
  gpu: 'history.gpu',
  battery: 'history.battery',
};

/** Hour and day ranges show clock times; the week range shows dates, which fit between its ticks. */
function axisTime(ts: number): string {
  const date = new Date(ts * 1000);
  if (range.key === 'week') return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Full time for the legend header, with the date added for the week range. */
function fullTime(ts: number): string {
  const date = new Date(ts * 1000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range.key !== 'week') return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function options(width: number): uPlot.Options {
  const grid = { stroke: token('--outline'), width: 1 };
  const ink = token('--on-surface-variant');
  return {
    width,
    height: CHART_HEIGHT,
    legend: { show: false },
    cursor: { drag: { x: false, y: false }, points: { size: 8, stroke: ink } },
    scales: {
      x: { time: true },
      y: { range: (_self, low, high) => yDomain([low, high]) },
    },
    axes: [
      {
        stroke: ink,
        grid,
        ticks: { stroke: token('--outline'), width: 1 },
        space: range.key === 'week' ? 84 : 64,
        values: (_self, ticks) => ticks.map((tick) => axisTime(tick)),
      },
      {
        stroke: ink,
        grid,
        ticks: { show: false },
        values: (_self, ticks) => ticks.map((tick) => `${Math.round(tick)}°`),
      },
    ],
    hooks: {
      setCursor: [(u) => updateLegend(u.cursor.idx ?? undefined)],
    },
    series: [
      {},
      ...SERIES_KEYS.map((key) => ({
        label: t(SERIES_LABEL[key]),
        stroke: token(SERIES_TOKEN[key]),
        width: 2.5,
        points: { show: false },
        spanGaps: false,
      })),
    ],
  };
}

function chartBox(): HTMLElement {
  return byId('historyChart');
}

function markRange(): void {
  for (const option of CHART_RANGES) {
    byId<Togglable>(`range-${option.key}`).setAttribute('variant', option.key === range.key ? 'filled' : 'outlined');
  }
}

/** Builds the legend rows for the series that have data; the values under the cursor are filled by updateLegend. */
function buildLegend(): void {
  const legend = byId('historyLegend');
  legend.replaceChildren();

  const header = document.createElement('div');
  header.className = 'legend-row legend-head';
  for (const text of ['', '', t('history.at'), t('history.min'), t('history.avg'), t('history.max')]) {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.append(cell);
  }
  legend.append(header);

  for (const key of SERIES_KEYS) {
    if (!stats[key]) continue;
    const row = document.createElement('div');
    row.className = `legend-row series-${key}`;
    row.dataset['series'] = key;
    const name = document.createElement('span');
    name.className = 'legend-name';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    name.append(swatch, t(SERIES_LABEL[key]));
    const at = document.createElement('span');
    at.className = 'legend-at';
    row.append(name, at);
    for (const field of ['min', 'avg', 'max'] as const) {
      const cell = document.createElement('span');
      cell.textContent = formatDegrees(stats[key]?.[field]);
      row.append(cell);
    }
    legend.append(row);
  }
}

function formatDegrees(value: number | undefined): string {
  return value === undefined ? t('common.noData') : `${value.toFixed(1)}°`;
}

/** Shows the values at the cursor, or the latest values when the pointer is off the chart. */
function updateLegend(index: number | undefined): void {
  const shown = index !== undefined ? points[index] : points[points.length - 1];
  byId('historyTime').textContent = shown ? fullTime(shown.ts) : '';
  for (const row of Array.from(byId('historyLegend').querySelectorAll<HTMLElement>('[data-series]'))) {
    const key = row.dataset['series'] as SeriesKey;
    const at = row.querySelector<HTMLElement>('.legend-at');
    if (at) at.textContent = formatDegrees(shown?.[key]);
  }
}

function showEmpty(): void {
  plot?.destroy();
  plot = undefined;
  chartBox().replaceChildren();
  byId('historyLegend').replaceChildren();
  byId('historyTime').textContent = '';
  byId('historyEmpty').hidden = false;
  chartBox().hidden = true;
}

function draw(): void {
  markRange();
  if (points.length === 0) {
    showEmpty();
    return;
  }
  byId('historyEmpty').hidden = true;
  chartBox().hidden = false;

  stats = {};
  for (const key of SERIES_KEYS) {
    const value = statsOf(points, key);
    if (value) stats[key] = value;
  }
  buildLegend();
  updateLegend(undefined);

  const data = toColumns(points, SERIES_KEYS) as uPlot.AlignedData;
  if (plot) {
    plot.destroy();
    plot = undefined;
  }
  const width = chartBox().clientWidth || 320;
  plot = new uPlot(options(width), data, chartBox());
  resizeObserver ??= new ResizeObserver(() => {
    if (plot) plot.setSize({ width: chartBox().clientWidth, height: CHART_HEIGHT });
  });
  resizeObserver.observe(chartBox());
}

export async function loadHistory(): Promise<void> {
  const result = await exec(
    `[ -f ${quote(LOGGER_DB)} ] && ${quote(KC_LOGGER)} series ${quote(LOGGER_DB)} ${range.seconds} ${range.points}`,
  );
  points = parseSeries(result.stdout);
  if (valuesOf(points, SERIES_KEYS).length === 0) points = [];
  draw();
}

export function initHistory(): void {
  for (const option of CHART_RANGES) {
    byId<Togglable>(`range-${option.key}`).addEventListener('click', () => {
      range = option;
      void loadHistory();
    });
  }
}
