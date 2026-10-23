import { KC_LOGGER, LOGGER_DB, quote } from '../core/config';
import { byId, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { t, type MessageKey } from '../logic/i18n';
import { CHART_RANGES, type ChartRange } from '../logic/loggerFormat';
import {
  SERIES_KEYS,
  nearestPoint,
  parseSeries,
  plot,
  yDomain,
  type Geometry,
  type SeriesKey,
  type SeriesPoint,
} from '../logic/seriesFormat';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GEOMETRY: Geometry = { width: 320, height: 180, left: 34, right: 12, top: 14, bottom: 26 };

const SERIES_NAME: Record<SeriesKey, MessageKey> = {
  cpu: 'history.cpu',
  gpu: 'history.gpu',
  battery: 'history.battery',
};

let range: ChartRange = CHART_RANGES[0];
let points: SeriesPoint[] = [];

function chartSvg(): SVGSVGElement {
  const node = document.getElementById('historyChart');
  if (!(node instanceof SVGSVGElement)) throw new Error('historyChart is not an SVG element');
  return node;
}

function svgNode(tag: string, attributes: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function clock(ts: number): string {
  const date = new Date(ts * 1000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range.key !== 'week') return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function markRange(): void {
  for (const option of CHART_RANGES) {
    byId<Togglable>(`range-${option.key}`).setAttribute('variant', option.key === range.key ? 'filled' : 'outlined');
  }
}

function drawEmpty(): void {
  byId('historyChart').replaceChildren();
  byId('historyLegend').replaceChildren();
  byId('historyEmpty').hidden = false;
  byId('chartBox').hidden = true;
}

/** Axis ticks at the ends and the middle of the y range, rounded to whole degrees. */
function ticks(low: number, high: number): number[] {
  return [high, (high + low) / 2, low].map((value) => Math.round(value));
}

function draw(): void {
  markRange();
  if (points.length === 0) {
    drawEmpty();
    return;
  }
  byId('historyEmpty').hidden = true;
  byId('chartBox').hidden = false;

  const values = points.flatMap((point) => SERIES_KEYS.map((key) => point[key]).filter((v): v is number => v !== undefined));
  const domain = yDomain(values);
  const [low, high] = domain;
  const plotted = plot(points, SERIES_KEYS, domain, GEOMETRY);
  const svg = chartSvg();
  svg.replaceChildren();

  const plotTop = GEOMETRY.top;
  const plotBottom = GEOMETRY.height - GEOMETRY.bottom;
  const y = (value: number): number => plotTop + (1 - (value - low) / (high - low)) * (plotBottom - plotTop);

  for (const tick of ticks(low, high)) {
    svg.append(svgNode('line', { x1: `${GEOMETRY.left}`, x2: `${GEOMETRY.width - GEOMETRY.right}`, y1: y(tick).toFixed(1), y2: y(tick).toFixed(1), class: 'chart-grid' }));
    const label = svgNode('text', { x: `${GEOMETRY.left - 6}`, y: (y(tick) + 4).toFixed(1), class: 'chart-axis', 'text-anchor': 'end' });
    label.textContent = `${tick}°`;
    svg.append(label);
  }

  const first = points[0]?.ts ?? 0;
  const last = points[points.length - 1]?.ts ?? first;
  const startLabel = svgNode('text', { x: `${GEOMETRY.left}`, y: `${GEOMETRY.height - 6}`, class: 'chart-axis' });
  startLabel.textContent = clock(first);
  const endLabel = svgNode('text', { x: `${GEOMETRY.width - GEOMETRY.right}`, y: `${GEOMETRY.height - 6}`, class: 'chart-axis', 'text-anchor': 'end' });
  endLabel.textContent = clock(last);
  svg.append(startLabel, endLabel);

  for (const series of plotted) {
    for (const d of series.paths) {
      svg.append(svgNode('path', { d, pathLength: '1', class: `chart-line series-${series.key}` }));
    }
  }
  const cursor = svgNode('line', { x1: '0', x2: '0', y1: `${plotTop}`, y2: `${plotBottom}`, class: 'chart-cursor', hidden: '' });
  cursor.id = 'chartCursor';
  svg.append(cursor);

  const legend = byId('historyLegend');
  legend.replaceChildren();
  for (const series of plotted) {
    const item = document.createElement('span');
    item.className = `legend-item series-${series.key}`;
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    const name = document.createElement('span');
    name.textContent = t(SERIES_NAME[series.key]);
    const value = document.createElement('strong');
    value.textContent = series.last === undefined ? t('common.noData') : `${series.last.toFixed(1)} °C`;
    item.append(swatch, name, value);
    legend.append(item);
  }
}

/** Puts the cursor on the bucket under the pointer and lists its values in the tip. */
function hover(event: PointerEvent): void {
  const svg = chartSvg();
  const tip = byId('chartTip');
  const cursor = svg.querySelector<SVGLineElement>('#chartCursor');
  if (points.length === 0 || !cursor) return;

  const rect = svg.getBoundingClientRect();
  const viewX = ((event.clientX - rect.left) / rect.width) * GEOMETRY.width;
  const first = points[0]?.ts ?? 0;
  const last = points[points.length - 1]?.ts ?? first;
  const plotWidth = GEOMETRY.width - GEOMETRY.left - GEOMETRY.right;
  const ts = first + ((viewX - GEOMETRY.left) / plotWidth) * Math.max(1, last - first);
  const point = nearestPoint(points, ts);
  if (!point) return;

  const pointX = GEOMETRY.left + ((point.ts - first) / Math.max(1, last - first)) * plotWidth;
  cursor.setAttribute('x1', pointX.toFixed(1));
  cursor.setAttribute('x2', pointX.toFixed(1));
  cursor.removeAttribute('hidden');

  tip.replaceChildren();
  const time = document.createElement('strong');
  time.textContent = clock(point.ts);
  tip.append(time);
  for (const key of SERIES_KEYS) {
    const value = point[key];
    if (value === undefined) continue;
    const row = document.createElement('span');
    row.className = `tip-row series-${key}`;
    row.textContent = `${t(SERIES_NAME[key])} ${value.toFixed(1)} °C`;
    tip.append(row);
  }
  tip.hidden = false;
  tip.style.left = `${Math.min(rect.width - 140, Math.max(0, ((pointX / GEOMETRY.width) * rect.width) - 60))}px`;
}

function leave(): void {
  byId('chartTip').hidden = true;
  byId('historyChart').querySelector('#chartCursor')?.setAttribute('hidden', '');
}

export async function loadHistory(): Promise<void> {
  const result = await exec(
    `[ -f ${quote(LOGGER_DB)} ] && ${quote(KC_LOGGER)} series ${quote(LOGGER_DB)} ${range.seconds} ${range.points}`,
  );
  points = parseSeries(result.stdout);
  draw();
}

export function initHistory(): void {
  for (const option of CHART_RANGES) {
    byId<Togglable>(`range-${option.key}`).addEventListener('click', () => {
      range = option;
      void loadHistory();
    });
  }
  const svg = chartSvg();
  svg.addEventListener('pointermove', hover);
  svg.addEventListener('pointerleave', leave);
}
