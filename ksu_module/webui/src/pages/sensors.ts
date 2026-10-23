import { SENSORS, quote } from '../core/config';
import { byId } from '../core/dom';
import { exec } from '../core/ksu';
import { t, type MessageKey } from '../logic/i18n';
import { fraction, hottest, memoryUsed, parseSensors, tempLevel, type Sensors, type TempLevel } from '../logic/sensorsFormat';

const SENSOR_INTERVAL_MS = 5000;
/** Temperatures are drawn on a 0 to 100 degree bar, so a full bar means the chip is at its limit. */
const TEMP_SCALE_C = 100;

/** The M3E indicator takes its colour from the primary role, so each band overrides that role. */
const LEVEL_COLOR: Record<TempLevel, string> = {
  cool: 'var(--success)',
  warm: 'var(--warning)',
  hot: 'var(--error)',
};

let sensorsBusy = false;

interface TileSpec {
  key: string;
  label: MessageKey;
  celsius: number;
}

interface Built {
  root: HTMLElement;
  label: HTMLElement;
  value: HTMLElement;
  fill: HTMLElement;
}

/**
 * Returns the element for a key, building its parts once. A refresh only changes text and the bar
 * value, so the indicator animates to the new reading instead of being replaced.
 */
function slot(box: HTMLElement, key: string, className: string, build: (root: HTMLElement) => Built): Built {
  for (const child of Array.from(box.children) as HTMLElement[]) {
    if (child.dataset['key'] === key) return lookup(child);
  }
  const root = document.createElement('div');
  root.dataset['key'] = key;
  root.className = className;
  box.append(root);
  return build(root);
}

function lookup(root: HTMLElement): Built {
  const find = (name: string): HTMLElement => root.querySelector<HTMLElement>(`[data-part="${name}"]`) as HTMLElement;
  return { root, label: find('label'), value: find('value'), fill: find('fill') };
}

function part(root: HTMLElement, name: string, className: string): HTMLElement {
  const node = document.createElement('span');
  node.dataset['part'] = name;
  node.className = className;
  root.append(node);
  return node;
}

/** An M3E linear progress indicator that reports its value as a percentage of 100. */
function progress(root: HTMLElement, name: string): HTMLElement {
  const node = document.createElement('m3e-linear-progress-indicator');
  node.dataset['part'] = name;
  node.setAttribute('max', '100');
  node.setAttribute('value', '0');
  root.append(node);
  return node;
}

function buildTile(root: HTMLElement): Built {
  const label = part(root, 'label', 'tile-label');
  const value = part(root, 'value', 'tile-value');
  const fill = progress(root, 'fill');
  return { root, label, value, fill };
}

function buildCore(root: HTMLElement): Built {
  const track = part(root, 'track', 'core-track');
  const fill = document.createElement('span');
  fill.dataset['part'] = 'fill';
  fill.className = 'core-fill';
  track.append(fill);
  const label = part(root, 'label', 'core-name');
  const value = part(root, 'value', 'core-value');
  return { root, label, value, fill };
}

/** Sets a progress indicator to a fraction from 0 to 1; a missing reading leaves it at zero. */
function setProgress(node: HTMLElement, value: number | undefined): void {
  node.setAttribute('value', String(Math.round((value ?? 0) * 100)));
}

/** Sets a vertical core bar; there is no vertical M3E indicator, so this one is drawn with the same tokens. */
function setCoreFill(node: HTMLElement, value: number | undefined): void {
  node.style.setProperty('--fill', String(value ?? 0));
}

function removeMissing(box: HTMLElement, keys: ReadonlySet<string>): void {
  for (const child of Array.from(box.children) as HTMLElement[]) {
    if (!keys.has(child.dataset['key'] ?? '')) child.remove();
  }
}

function renderTiles(specs: readonly TileSpec[]): void {
  const box = byId('tempTiles');
  removeMissing(box, new Set(specs.map((spec) => spec.key)));
  for (const spec of specs) {
    const built = slot(box, spec.key, 'tile', buildTile);
    const level = tempLevel(spec.celsius);
    built.root.className = `tile tile-${level}`;
    built.fill.style.setProperty('--md-sys-color-primary', LEVEL_COLOR[level]);
    built.label.textContent = t(spec.label);
    built.value.textContent = `${spec.celsius.toFixed(1)} °C`;
    setProgress(built.fill, fraction(spec.celsius, TEMP_SCALE_C));
  }
}

function renderCores(sensors: Sensors): void {
  const box = byId('coreBars');
  const cores = sensors.cores;
  const top = Math.max(1, ...cores.map((core) => core.maxMhz ?? core.mhz));
  removeMissing(box, new Set(cores.map((core) => `cpu${core.core}`)));
  for (const core of cores) {
    const built = slot(box, `cpu${core.core}`, 'core', buildCore);
    built.label.textContent = `cpu${core.core}`;
    built.value.textContent = `${core.mhz}`;
    setCoreFill(built.fill, fraction(core.mhz, core.maxMhz ?? top));
  }
}

function renderMemory(sensors: Sensors): void {
  const meter = byId('memoryMeter');
  const used = memoryUsed(sensors);
  meter.hidden = used === undefined;
  if (used === undefined || sensors.memTotalMb === undefined || sensors.memAvailMb === undefined) return;
  byId('memoryText').textContent = t('status.memoryValue', {
    free: (sensors.memAvailMb / 1024).toFixed(1),
    total: (sensors.memTotalMb / 1024).toFixed(1),
  });
  setProgress(byId('memoryFill'), used);
}

function tileSpecs(sensors: Sensors): TileSpec[] {
  const zones = sensors.thermal;
  const specs: TileSpec[] = [];
  const add = (key: string, label: MessageKey, celsius: number | undefined): void => {
    if (celsius !== undefined) specs.push({ key, label, celsius });
  };
  add('cpu', 'status.tempCpu', hottest(zones, 'cpu'));
  add('gpu', 'status.tempGpu', hottest(zones, 'gpu'));
  add('ram', 'status.tempRam', hottest(zones, 'ram'));
  add('battery', 'status.tempBattery', sensors.batteryCelsius);
  add('other', 'status.tempOther', hottest(zones, 'other'));
  return specs;
}

export async function loadSensors(): Promise<void> {
  const result = await exec(`${quote(SENSORS)} info`);
  const sensors = parseSensors(result.stdout);
  renderTiles(tileSpecs(sensors));
  renderCores(sensors);
  renderMemory(sensors);
}

function statusTabOpen(): boolean {
  return document.querySelector('.nav-item[data-tab="status"][aria-current="page"]') !== null;
}

/** Only polls while the Status tab is on screen, so a hidden page does not keep starting root shells. */
export function initSensorPolling(): void {
  window.setInterval(() => {
    if (sensorsBusy || document.hidden || !statusTabOpen()) return;
    sensorsBusy = true;
    loadSensors()
      .catch(() => undefined)
      .finally(() => {
        sensorsBusy = false;
      });
  }, SENSOR_INTERVAL_MS);
}
