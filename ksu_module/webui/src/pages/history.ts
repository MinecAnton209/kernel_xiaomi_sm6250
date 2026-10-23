import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { KC_LOGGER, LOGGER_DB, quote } from '../core/config';
import { byId, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { t } from '../logic/i18n';
import { CHART_RANGES, type ChartRange } from '../logic/loggerFormat';
import { SERIES_KEYS, parseSeries, toColumns, valuesOf, yDomain, type SeriesKey, type SeriesPoint } from '../logic/seriesFormat';

const CHART_HEIGHT = 200;

let range: ChartRange = CHART_RANGES[0];
let points: SeriesPoint[] = [];
let plot: uPlot | undefined;
let resizeObserver: ResizeObserver | undefined;

/** Reads a theme colour at draw time, so the chart follows the light or dark theme the page is in. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function clock(ts: number): string {
  const date = new Date(ts * 1000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range.key !== 'week') return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

const SERIES_TOKEN: Record<SeriesKey, string> = {
  cpu: '--series-1',
  gpu: '--series-2',
  battery: '--series-3',
};

const SERIES_LABEL: Record<SeriesKey, 'history.cpu' | 'history.gpu' | 'history.battery'> = {
  cpu: 'history.cpu',
  gpu: 'history.gpu',
  battery: 'history.battery',
};

function options(width: number): uPlot.Options {
  const grid = { stroke: token('--outline'), width: 1 };
  const ink = token('--on-surface-variant');
  return {
    width,
    height: CHART_HEIGHT,
    legend: { live: true },
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
        values: (_self, ticks) => ticks.map((tick) => clock(tick)),
      },
      {
        stroke: ink,
        grid,
        ticks: { show: false },
        values: (_self, ticks) => ticks.map((tick) => `${Math.round(tick)}°`),
      },
    ],
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

function showEmpty(): void {
  plot?.destroy();
  plot = undefined;
  chartBox().replaceChildren();
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

  const data = toColumns(points, SERIES_KEYS) as uPlot.AlignedData;
  if (plot) {
    plot.setData(data, true);
    return;
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
      plot?.destroy();
      plot = undefined;
      void loadHistory();
    });
  }
}
