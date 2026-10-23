import { LOGGER, quote } from '../core/config';
import { busy, byId, type Togglable } from '../core/dom';
import { exec, run } from '../core/ksu';
import { toast } from '../core/toast';
import { t } from '../logic/i18n';
import { formatBytes, LOGGER_INTERVALS, parseLoggerStatus, RETENTION_PRESETS, validRetention, type LoggerInterval, type LoggerStatus } from '../logic/loggerFormat';
import { showDialog } from '../ui/dialog';

interface SwitchElement extends HTMLElement {
  checked: boolean;
}

let interval: LoggerInterval = 60;

function markInterval(value: LoggerInterval): void {
  interval = value;
  for (const option of LOGGER_INTERVALS) {
    byId<Togglable>(`loggerInterval-${option}`).setAttribute('variant', option === value ? 'filled' : 'outlined');
  }
}

/** The line under the title says what the logger is doing right now, in one sentence. */
function describe(status: LoggerStatus): string {
  if (!status.enabled) return t('logger.stateOff');
  return t('logger.stateOn', { seconds: status.interval });
}

function markPreset(days: number | undefined): void {
  for (const button of Array.from(byId('retentionPresets').children) as Togglable[]) {
    button.setAttribute('variant', Number(button.dataset['days']) === days ? 'filled' : 'outlined');
  }
}

function renderPresets(): void {
  const box = byId('retentionPresets');
  for (const days of RETENTION_PRESETS) {
    const button = document.createElement('m3e-button') as Togglable;
    button.dataset['days'] = String(days);
    button.setAttribute('variant', 'outlined');
    button.textContent = t('logger.presetDays', { days });
    button.addEventListener('click', () => {
      byId<HTMLInputElement>('loggerDays').value = String(days);
      markPreset(days);
    });
    box.append(button);
  }
}

function renderStats(status: LoggerStatus): void {
  byId('loggerCount').textContent = String(status.rows);
  byId('loggerSize').textContent = formatBytes(status.bytes);
  byId('loggerOldest').textContent =
    status.oldest === undefined ? '—' : new Date(status.oldest * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Shows the saved settings and the state of the history; the System tab calls it on every load. */
export async function loadLogger(): Promise<void> {
  const result = await exec(`${quote(LOGGER)} status`);
  const status = parseLoggerStatus(result.stdout);
  byId<SwitchElement>('loggerEnabled').checked = status.enabled;
  byId('loggerState').textContent = describe(status);
  byId<HTMLInputElement>('loggerDays').value = String(status.retentionDays);
  markPreset(status.retentionDays);
  markInterval(status.interval);
  renderStats(status);
}

async function saveLogger(): Promise<void> {
  const days = validRetention(byId<HTMLInputElement>('loggerDays').value);
  if (days === undefined) {
    toast(t('logger.invalid'));
    return;
  }
  const enabled = byId<SwitchElement>('loggerEnabled').checked ? 1 : 0;
  await run(`${quote(LOGGER)} configure ${enabled} ${interval} ${days}`, t('logger.saved'));
  await loadLogger();
}

async function clearLogger(): Promise<void> {
  if ((await showDialog('clearHistoryDialog', 'cancel')) !== 'clear') return;
  await run(`${quote(LOGGER)} clear`, t('logger.cleared'));
  await loadLogger();
}

export function initLogger(): void {
  renderPresets();
  byId<HTMLInputElement>('loggerDays').addEventListener('input', (event) => {
    markPreset(validRetention((event.target as HTMLInputElement).value));
  });
  for (const option of LOGGER_INTERVALS) {
    byId<Togglable>(`loggerInterval-${option}`).addEventListener('click', () => markInterval(option));
  }
  const save = byId<Togglable>('loggerSave');
  save.addEventListener('click', () => void busy(save, saveLogger));
  const clear = byId<Togglable>('loggerClear');
  clear.addEventListener('click', () => void busy(clear, clearLogger));
}
