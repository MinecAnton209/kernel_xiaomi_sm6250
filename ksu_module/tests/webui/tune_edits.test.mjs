import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDefaults, parseDump } from '../../webui/src/logic/tuneDump.ts';
import {
  canUseDefaults,
  defaultEdits,
  isValidChoice,
  pendingChanges,
  pruneEdits,
  recordEdit,
  shownValue,
  toUnsavedChoice,
} from '../../webui/src/logic/tuneEdits.ts';

const ORDER = ['io_scheduler', 'tcp_congestion', 'swappiness', 'gpu_governor'];

const states = () =>
  parseDump(
    [
      'io_scheduler\tdeadline\tnoop deadline cfq',
      'tcp_congestion\tcubic\treno cubic bbr',
      'swappiness\t60\trange 0 100',
      'gpu_governor\t\t',
    ].join('\n'),
  );

test('a choice is recorded, and dropped again when it equals the applied value', () => {
  const edits = new Map();
  recordEdit(edits, 'tcp_congestion', 'bbr', 'cubic');
  assert.deepEqual([...edits], [['tcp_congestion', 'bbr']]);
  recordEdit(edits, 'tcp_congestion', 'cubic', 'cubic');
  assert.equal(edits.size, 0);
});

test('a later choice for the same setting replaces the earlier one', () => {
  const edits = new Map();
  recordEdit(edits, 'tcp_congestion', 'bbr', 'cubic');
  recordEdit(edits, 'tcp_congestion', 'reno', 'cubic');
  assert.deepEqual([...edits], [['tcp_congestion', 'reno']]);
});

test('a choice for one setting leaves the others alone', () => {
  const edits = new Map();
  recordEdit(edits, 'tcp_congestion', 'bbr', 'cubic');
  recordEdit(edits, 'swappiness', '30', '60');
  recordEdit(edits, 'swappiness', '60', '60');
  assert.deepEqual([...edits], [['tcp_congestion', 'bbr']]);
});

test('a list value is valid only when the kernel offers it', () => {
  const tcp = states().get('tcp_congestion');
  assert.equal(isValidChoice(tcp, 'bbr'), true);
  assert.equal(isValidChoice(tcp, 'vegas'), false);
  assert.equal(isValidChoice(tcp, ''), false);
});

test('a number is valid inside the range, bounds included', () => {
  const swappiness = states().get('swappiness');
  for (const value of ['0', '60', '100']) assert.equal(isValidChoice(swappiness, value), true, value);
  for (const value of ['101', '-1', '', 'abc', '1.5', '6 0']) assert.equal(isValidChoice(swappiness, value), false, value);
});

test('a setting the kernel lacks accepts nothing', () => {
  assert.equal(isValidChoice(states().get('gpu_governor'), 'performance'), false);
});

test('pending changes follow the order of the settings, not the order of the edits', () => {
  const edits = new Map([
    ['swappiness', '30'],
    ['io_scheduler', 'noop'],
  ]);
  assert.deepEqual(pendingChanges(ORDER, states(), edits), [
    { key: 'io_scheduler', value: 'noop' },
    { key: 'swappiness', value: '30' },
  ]);
});

test('an edit equal to the applied value, or for an unknown setting, is not a change', () => {
  const edits = new Map([
    ['io_scheduler', 'deadline'],
    ['made_up', 'x'],
  ]);
  assert.deepEqual(pendingChanges(ORDER, states(), edits), []);
});

test('no edits means no changes', () => {
  assert.deepEqual(pendingChanges(ORDER, states(), new Map()), []);
});

test('pruning keeps real edits and drops the ones a reload made redundant', () => {
  const edits = new Map([
    ['tcp_congestion', 'bbr'],
    ['swappiness', '60'],
    ['made_up', 'x'],
  ]);
  pruneEdits(edits, states());
  assert.deepEqual([...edits], [['tcp_congestion', 'bbr']]);
});

test('a control shows the pending choice, or the applied value without one', () => {
  const state = states().get('tcp_congestion');
  assert.equal(shownValue(state, 'tcp_congestion', new Map()), 'cubic');
  assert.equal(shownValue(state, 'tcp_congestion', new Map([['tcp_congestion', 'bbr']])), 'bbr');
});

test('parseDefaults reads key and value, and skips blank or incomplete lines', () => {
  const parsed = parseDefaults('io_scheduler\tdeadline\n\nthp\t\nswappiness\t60\nnonsense\n');
  assert.deepEqual([...parsed], [
    ['io_scheduler', 'deadline'],
    ['swappiness', '60'],
  ]);
  assert.equal(parseDefaults('').size, 0);
});

const DEFAULTS = new Map([
  ['io_scheduler', 'deadline'],
  ['tcp_congestion', 'bbr'],
  ['swappiness', '60'],
  ['gpu_governor', 'msm-adreno-tz'],
]);

test('defaults only produce edits where the kernel is not already at the default', () => {
  assert.deepEqual([...defaultEdits(ORDER, states(), DEFAULTS)], [['tcp_congestion', 'bbr']]);
});

test('a default the kernel no longer offers is not used', () => {
  const stale = new Map([
    ['tcp_congestion', 'vegas'],
    ['swappiness', '500'],
  ]);
  assert.equal(defaultEdits(ORDER, states(), stale).size, 0);
});

test('a setting without a remembered default is left as it is', () => {
  assert.equal(defaultEdits(ORDER, states(), new Map()).size, 0);
});

test('defaults replace earlier choices instead of adding to them', () => {
  const edits = defaultEdits(ORDER, states(), new Map([['io_scheduler', 'deadline']]));
  assert.equal(edits.size, 0);
});

test('the defaults button is useful only while something differs from the default', () => {
  assert.equal(canUseDefaults(ORDER, states(), DEFAULTS, new Map()), true);
  assert.equal(canUseDefaults(ORDER, states(), DEFAULTS, new Map([['tcp_congestion', 'bbr']])), false);
  assert.equal(canUseDefaults(ORDER, states(), new Map(), new Map()), false);
});

test('a choice that moves a setting away from its default makes the defaults button useful again', () => {
  const edits = new Map([
    ['tcp_congestion', 'bbr'],
    ['io_scheduler', 'noop'],
  ]);
  assert.equal(canUseDefaults(ORDER, states(), DEFAULTS, edits), true);
});

test('an answer of the unsaved-changes dialog is read as stay unless it is a known one', () => {
  assert.equal(toUnsavedChoice('save'), 'save');
  assert.equal(toUnsavedChoice('discard'), 'discard');
  assert.equal(toUnsavedChoice('stay'), 'stay');
  assert.equal(toUnsavedChoice(''), 'stay');
  assert.equal(toUnsavedChoice(undefined), 'stay');
  assert.equal(toUnsavedChoice(null), 'stay');
  assert.equal(toUnsavedChoice('SAVE'), 'stay');
  assert.equal(toUnsavedChoice('cancel'), 'stay');
});
