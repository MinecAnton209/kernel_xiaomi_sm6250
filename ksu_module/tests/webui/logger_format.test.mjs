import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGGER_INTERVALS, formatBytes, parseLoggerStatus, validRetention } from '../../webui/src/logic/loggerFormat.ts';

const RUNNING = [
  'enabled=1',
  'interval=5',
  'retention_days=14',
  'running=1',
  'rows=17280',
  'oldest=1792700000',
  'newest=1792786400',
  'bytes=1048576',
].join('\n');

test('the logger offers exactly the two intervals the user can choose', () => {
  assert.deepEqual([...LOGGER_INTERVALS], [5, 60]);
});

test('parseLoggerStatus reads a running logger with history', () => {
  assert.deepEqual(parseLoggerStatus(RUNNING), {
    enabled: true,
    interval: 5,
    retentionDays: 14,
    running: true,
    rows: 17280,
    oldest: 1792700000,
    newest: 1792786400,
    bytes: 1048576,
  });
});

test('parseLoggerStatus reports a disabled logger that has no history yet', () => {
  assert.deepEqual(parseLoggerStatus('enabled=0\ninterval=60\nretention_days=7\nrunning=0'), {
    enabled: false,
    interval: 60,
    retentionDays: 7,
    running: false,
    rows: 0,
    oldest: undefined,
    newest: undefined,
    bytes: 0,
  });
});

test('parseLoggerStatus falls back to the module defaults when lines are missing', () => {
  const status = parseLoggerStatus('');
  assert.equal(status.enabled, false);
  assert.equal(status.interval, 60);
  assert.equal(status.retentionDays, 7);
  assert.equal(status.running, false);
});

test('parseLoggerStatus does not show a time range when there are no rows', () => {
  const status = parseLoggerStatus('rows=0\noldest=0\nnewest=0\nbytes=12288');
  assert.equal(status.oldest, undefined);
  assert.equal(status.newest, undefined);
  assert.equal(status.bytes, 12288);
});

test('parseLoggerStatus turns an interval it does not know into the default', () => {
  assert.equal(parseLoggerStatus('interval=10').interval, 60);
  assert.equal(parseLoggerStatus('interval=abc').interval, 60);
});

test('parseLoggerStatus reads a negative or garbled number as missing', () => {
  const status = parseLoggerStatus('rows=-5\nbytes=lots\nretention_days=');
  assert.equal(status.rows, 0);
  assert.equal(status.bytes, 0);
  assert.equal(status.retentionDays, 7);
});

test('validRetention accepts whole days from 1 to 365', () => {
  assert.equal(validRetention('1'), 1);
  assert.equal(validRetention(' 30 '), 30);
  assert.equal(validRetention('365'), 365);
});

test('validRetention rejects zero, values above a year and anything that is not a whole number', () => {
  assert.equal(validRetention('0'), undefined);
  assert.equal(validRetention('366'), undefined);
  assert.equal(validRetention('7.5'), undefined);
  assert.equal(validRetention('-3'), undefined);
  assert.equal(validRetention('week'), undefined);
  assert.equal(validRetention(''), undefined);
});

test('formatBytes shows kilobytes below a megabyte and megabytes from there on', () => {
  assert.equal(formatBytes(12288), '12 KB');
  assert.equal(formatBytes(1048575), '1024 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(15728640), '15.0 MB');
});
