import { byId } from './dom';
import { barState, type BarState, type Progress } from './progressMath';

export type Step = 'download' | 'verify' | 'install';
type PanelState = 'running' | 'success' | 'error';
type LinearIndicator = HTMLElement & {
  mode: 'determinate' | 'indeterminate' | 'buffer' | 'query';
  value: number;
  bufferValue: number;
};

const FULL: BarState = { mode: 'buffer', value: 100, buffer: 100 };

const MIB = 1024 * 1024;
const SPEED_SMOOTHING = 0.25;

interface Sample {
  at: number;
  done: number;
}

let lastSample: Sample | null = null;
let speed = 0;
let onCancel: (() => void) | null = null;
let onRetry: (() => void) | null = null;

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))} с`;
  const minutes = Math.floor(seconds / 60);
  return `~${minutes} мин ${Math.round(seconds % 60)} с`;
}

function setState(state: PanelState): void {
  byId('installPanel').dataset.state = state;
}

function setSteps(active: Step | null, steps: readonly Step[]): void {
  const order: readonly Step[] = ['download', 'verify', 'install'];
  const activeIndex = active ? order.indexOf(active) : order.length;
  for (const item of byId('installSteps').querySelectorAll<HTMLElement>('li')) {
    const step = item.dataset.step as Step;
    item.hidden = !steps.includes(step);
    const index = order.indexOf(step);
    item.dataset.status = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';
  }
}

let barNow: BarState = { mode: 'query' };

function setIndicator(state: BarState): void {
  barNow = state;
  const bar = byId<LinearIndicator>('installBar');
  bar.mode = state.mode;
  if (state.mode === 'buffer') {
    bar.value = state.value;
    bar.bufferValue = state.buffer;
  }
}

function setButtons(cancel: boolean, retry: boolean, done: boolean): void {
  byId('installCancel').hidden = !cancel;
  byId('installRetry').hidden = !retry;
  byId('installDone').hidden = !done;
}

export interface PanelOptions {
  title: string;
  subtitle: string;
  steps: readonly Step[];
  onCancel: () => void;
  onRetry: () => void;
}

export function openPanel(options: PanelOptions): void {
  lastSample = null;
  speed = 0;
  onCancel = options.onCancel;
  onRetry = options.onRetry;

  const panel = byId('installPanel');
  // Restart the entrance animation when the panel is reopened for a retry.
  panel.hidden = true;
  void panel.offsetWidth;
  panel.hidden = false;

  setState('running');
  byId('installTitle').textContent = options.title;
  byId('installSub').textContent = options.subtitle;
  byId('installPct').textContent = '0%';
  byId('installMeta').textContent = 'Подключение…';
  byId('installLog').hidden = true;
  byId('installLog').textContent = '';
  setSteps(options.steps[0] ?? null, options.steps);
  setIndicator({ mode: 'query' });
  setButtons(true, false, false);
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function setStep(step: Step, steps: readonly Step[]): void {
  setSteps(step, steps);
  if (step === 'verify') {
    setIndicator({ mode: 'indeterminate' });
    byId('installMeta').textContent = 'Проверяем контрольную сумму…';
    byId('installPct').textContent = '100%';
  } else if (step === 'install') {
    setIndicator({ mode: 'indeterminate' });
    byId('installMeta').textContent = 'KernelSU устанавливает модуль…';
    byId('installPct').textContent = '';
    setButtons(false, false, false);
  }
}

export function setProgress(progress: Progress, threads: number): void {
  const { done, total } = progress;
  const now = performance.now();
  if (lastSample && now > lastSample.at && done >= lastSample.done) {
    const instant = ((done - lastSample.done) / (now - lastSample.at)) * 1000;
    speed = speed === 0 ? instant : speed + (instant - speed) * SPEED_SMOOTHING;
  }
  lastSample = { at: now, done };

  setIndicator(barState(progress, threads));

  if (total <= 0) {
    byId('installPct').textContent = done > 0 ? `${formatMib(done)} MB` : '';
    byId('installMeta').textContent = done > 0 ? `${formatMib(done)} MB · ${formatMib(speed)} MB/s` : 'Подключение…';
    return;
  }

  const fraction = done / total;
  byId('installPct').textContent = `${Math.floor(fraction * 100)}%`;
  const parts = [`${formatMib(done)} из ${formatMib(total)} MB`];
  if (speed > 0) {
    parts.push(`${formatMib(speed)} MB/s`);
    const eta = formatEta((total - done) / speed);
    if (eta) parts.push(eta);
  }
  byId('installMeta').textContent = parts.join(' · ');
}

export function showSuccess(title: string, detail: string): void {
  setState('success');
  setIndicator(FULL);
  setSteps(null, ['download', 'verify', 'install']);
  byId('installTitle').textContent = title;
  byId('installSub').textContent = detail;
  byId('installPct').textContent = '';
  byId('installMeta').textContent = '';
  setButtons(false, false, true);
}

export function showError(title: string, detail: string, log: string, canRetry: boolean): void {
  setState('error');
  // An indeterminate or query bar would keep animating after a failure, so freeze it as a full red bar.
  if (barNow.mode !== 'buffer') setIndicator(FULL);
  byId('installTitle').textContent = title;
  byId('installSub').textContent = detail;
  byId('installPct').textContent = '';
  byId('installMeta').textContent = '';
  const logEl = byId('installLog');
  logEl.textContent = log;
  logEl.hidden = log === '';
  setButtons(false, canRetry, true);
}

export function closePanel(): void {
  byId('installPanel').hidden = true;
  onCancel = null;
  onRetry = null;
}

export function initPanel(): void {
  byId('installCancel').addEventListener('click', () => onCancel?.());
  byId('installRetry').addEventListener('click', () => onRetry?.());
  byId('installDone').addEventListener('click', closePanel);
}
