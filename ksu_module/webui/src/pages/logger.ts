import { LOGGER, quote } from '../core/config';
import { busy, byId, type Togglable } from '../core/dom';
import { exec, run } from '../core/ksu';
import { toast } from '../core/toast';
import { t } from '../logic/i18n';
import type { ChipSpec } from '../logic/chargeFormat';
import { formatBytes, LOGGER_INTERVALS, parseLoggerStatus, validRetention, type LoggerInterval, type LoggerStatus } from '../logic/loggerFormat';
import { createChipList, type ChipList } from '../ui/chipList';
import { showDialog } from '../ui/dialog';

interface SwitchElement extends HTMLElement {
  checked: boolean;
}

let infoChips: ChipList | undefined;
let interval: LoggerInterval = 60;

function markInterval(value: LoggerInterval): void {
  interval = value;
  for (const option of LOGGER_INTERVALS) {
    byId<Togglable>(`loggerInterval-${option}`).setAttribute('variant', option === value ? 'filled' : 'outlined');
  }
}

function summary(status: LoggerStatus): ChipSpec[] {
  return [
    { key: 'state', text: t(status.running ? 'logger.running' : 'logger.stopped'), state: status.running ? 'ok' : 'off' },
    { key: 'interval', text: t('logger.intervalValue', { seconds: status.interval }), state: '' },
    { key: 'retention', text: t('logger.retentionValue', { days: status.retentionDays }), state: '' },
    { key: 'rows', text: t('logger.rowsCount', { count: status.rows }), state: '' },
    { key: 'size', text: t('logger.sizeValue', { size: formatBytes(status.bytes) }), state: '' },
  ];
}

/** Shows the saved settings and the state of the history; the Status tab calls it on every load. */
export async function loadLogger(): Promise<void> {
  const result = await exec(`${quote(LOGGER)} status`);
  const status = parseLoggerStatus(result.stdout);
  byId<SwitchElement>('loggerEnabled').checked = status.enabled;
  byId<HTMLInputElement>('loggerDays').value = String(status.retentionDays);
  markInterval(status.interval);
  infoChips ??= createChipList(byId('loggerInfo'));
  infoChips.update(summary(status));
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
  for (const option of LOGGER_INTERVALS) {
    byId<Togglable>(`loggerInterval-${option}`).addEventListener('click', () => markInterval(option));
  }
  const save = byId<Togglable>('loggerSave');
  save.addEventListener('click', () => void busy(save, saveLogger));
  const clear = byId<Togglable>('loggerClear');
  clear.addEventListener('click', () => void busy(clear, clearLogger));
}
