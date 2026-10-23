export const LOGGER_INTERVALS = [5, 60] as const;
export type LoggerInterval = (typeof LOGGER_INTERVALS)[number];

export const LOGGER_MAX_DAYS = 365;

/** Quick choices next to the retention field, in days. */
export const RETENTION_PRESETS = [1, 7, 30, 90, 365] as const;

/** Time ranges of the history chart; `points` keeps every range at a readable density. */
export const CHART_RANGES = [
  { key: 'hour', seconds: 3600, points: 60 },
  { key: 'day', seconds: 86400, points: 96 },
  { key: 'week', seconds: 604800, points: 168 },
] as const;

export type ChartRange = (typeof CHART_RANGES)[number];

export interface LoggerStatus {
  enabled: boolean;
  interval: LoggerInterval;
  retentionDays: number;
  running: boolean;
  rows: number;
  oldest?: number;
  newest?: number;
  bytes: number;
}

function number(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function interval(value: string | undefined): LoggerInterval {
  const seconds = number(value);
  return LOGGER_INTERVALS.find((option) => option === seconds) ?? 60;
}

/** Reads the output of `logger.sh status`; a missing line falls back to the default the module uses. */
export function parseLoggerStatus(text: string): LoggerStatus {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  const rows = number(values.get('rows')) ?? 0;
  const oldest = number(values.get('oldest'));
  const newest = number(values.get('newest'));
  return {
    enabled: values.get('enabled') === '1',
    interval: interval(values.get('interval')),
    retentionDays: number(values.get('retention_days')) ?? 7,
    running: values.get('running') === '1',
    rows,
    oldest: rows > 0 ? oldest : undefined,
    newest: rows > 0 ? newest : undefined,
    bytes: number(values.get('bytes')) ?? 0,
  };
}

/** Returns the retention in whole days when it is between 1 and the maximum, otherwise undefined. */
export function validRetention(text: string): number | undefined {
  const days = number(text);
  if (days === undefined || days < 1 || days > LOGGER_MAX_DAYS) return undefined;
  return days;
}

/** The size of the history in KB or MB, with one decimal from the MB step on. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
