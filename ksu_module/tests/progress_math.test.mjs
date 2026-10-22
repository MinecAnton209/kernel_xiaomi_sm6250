import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barState, parseProgress, partRange, slowestFraction } from '../webui/src/progressMath.ts';

test('parseProgress reads done, total and per part sizes', () => {
  assert.deepEqual(parseProgress('100 400 40 30 20 10'), { done: 100, total: 400, parts: [40, 30, 20, 10] });
});

test('parseProgress accepts the old two number format', () => {
  assert.deepEqual(parseProgress('100 400'), { done: 100, total: 400, parts: [] });
});

test('parseProgress treats empty or missing output as nothing yet', () => {
  assert.deepEqual(parseProgress(''), { done: 0, total: 0, parts: [] });
  assert.deepEqual(parseProgress('   \n'), { done: 0, total: 0, parts: [] });
  assert.deepEqual(parseProgress('7'), { done: 7, total: 0, parts: [] });
});

test('parseProgress turns garbage and negative numbers into zero', () => {
  assert.deepEqual(parseProgress('abc -5 x 10'), { done: 0, total: 0, parts: [0, 10] });
});

test('parseProgress copes with extra whitespace and a trailing newline', () => {
  assert.deepEqual(parseProgress('  1   2  3\n'), { done: 1, total: 2, parts: [3] });
});

test('partRange splits evenly', () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => partRange(i, 400, 4)), [100, 100, 100, 100]);
});

test('partRange gives the last part the remainder', () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => partRange(i, 10, 4)), [3, 3, 3, 1]);
  assert.equal([0, 1, 2, 3].reduce((sum, i) => sum + partRange(i, 10, 4), 0), 10);
});

test('partRange is zero past the end, for no data and for bad thread counts', () => {
  assert.equal(partRange(3, 2, 4), 0);
  assert.equal(partRange(0, 0, 4), 0);
  assert.equal(partRange(0, 100, 0), 0);
  assert.equal(partRange(0, -1, 4), 0);
});

test('slowestFraction picks the part that is furthest behind', () => {
  assert.equal(slowestFraction([100, 50, 100, 100], 400, 4), 0.5);
  assert.equal(slowestFraction([100, 100, 100, 0], 400, 4), 0);
  assert.equal(slowestFraction([100, 100, 100, 100], 400, 4), 1);
});

test('slowestFraction clamps a part that reports more than its range', () => {
  assert.equal(slowestFraction([500, 500, 500, 500], 400, 4), 1);
});

test('slowestFraction measures the shorter last part against its own size', () => {
  assert.equal(slowestFraction([3, 3, 3, 1], 10, 4), 1);
  assert.equal(slowestFraction([3, 3, 3, 0], 10, 4), 0);
});

test('slowestFraction is zero without usable parts', () => {
  assert.equal(slowestFraction([], 400, 4), 0);
  assert.equal(slowestFraction([10], 0, 4), 0);
});

test('barState is query before anything is known', () => {
  assert.deepEqual(barState(parseProgress(''), 4), { mode: 'query' });
  assert.deepEqual(barState(parseProgress('0 0'), 4), { mode: 'query' });
});

test('barState is indeterminate when bytes arrive but the size is unknown', () => {
  assert.deepEqual(barState(parseProgress('2048 0'), 4), { mode: 'indeterminate' });
});

test('barState buffer mode: buffer is everything received, value the slowest part', () => {
  const state = barState(parseProgress('250 400 100 50 50 50'), 4);
  assert.equal(state.mode, 'buffer');
  assert.equal(state.buffer, 62.5);
  assert.equal(state.value, 50);
});

test('barState value never exceeds the buffer', () => {
  for (const raw of ['0 400 0 0 0 0', '100 400 25 25 25 25', '400 400 100 100 100 100', '300 400 100 100 100 0']) {
    const state = barState(parseProgress(raw), 4);
    assert.ok(state.value <= state.buffer, raw);
  }
});

test('barState starts at zero once the size is known', () => {
  assert.deepEqual(barState(parseProgress('0 400 0 0 0 0'), 4), { mode: 'buffer', value: 0, buffer: 0 });
});

test('barState reaches 100 on both bars when every part is complete', () => {
  assert.deepEqual(barState(parseProgress('400 400 100 100 100 100'), 4), { mode: 'buffer', value: 100, buffer: 100 });
});

test('barState without part sizes shows one bar level with the buffer', () => {
  assert.deepEqual(barState(parseProgress('100 400'), 4), { mode: 'buffer', value: 25, buffer: 25 });
  assert.deepEqual(barState(parseProgress('100 400 100'), 4), { mode: 'buffer', value: 25, buffer: 25 });
});

test('barState clamps a download that reports more than the total', () => {
  assert.deepEqual(barState(parseProgress('500 400'), 4), { mode: 'buffer', value: 100, buffer: 100 });
});
