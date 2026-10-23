import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSeries, toColumns, valuesOf, yDomain } from '../../webui/src/logic/seriesFormat.ts';

test('parseSeries reads bucket time and the three temperatures, and sorts by time', () => {
  const points = parseSeries('1000|41.0|39.5|31.8|2208|600|2823\n900|40.0|||||');
  assert.deepEqual(points, [
    { ts: 900, cpu: 40 },
    { ts: 1000, cpu: 41, gpu: 39.5, battery: 31.8 },
  ]);
});

test('parseSeries leaves out a temperature that is empty in a bucket', () => {
  const [point] = parseSeries('500|||30.0|||');
  assert.equal(point?.cpu, undefined);
  assert.equal(point?.gpu, undefined);
  assert.equal(point?.battery, 30);
});

test('parseSeries skips lines without a time', () => {
  assert.deepEqual(parseSeries('|41.0\nnot a number|1\n'), []);
  assert.deepEqual(parseSeries(''), []);
});

test('yDomain holds every value with two degrees of air on both sides', () => {
  assert.deepEqual(yDomain([30, 50]), [28, 52]);
});

test('yDomain is never narrower than 10 degrees', () => {
  const [low, high] = yDomain([40, 41]);
  assert.ok(high - low >= 10);
});

test('yDomain falls back to a sensible range when there are no values', () => {
  assert.deepEqual(yDomain([]), [20, 60]);
});

test('toColumns puts the time first and one column per requested series', () => {
  const points = parseSeries('0|10.0|20.0|30.0\n100|11.0|21.0|31.0');
  assert.deepEqual(toColumns(points, ['gpu', 'cpu']), [
    [0, 100],
    [20, 21],
    [10, 11],
  ]);
});

test('toColumns writes null where a bucket has no value so the chart leaves a gap', () => {
  const points = parseSeries('0|10.0\n50|\n100|20.0');
  assert.deepEqual(toColumns(points, ['cpu'])[1], [10, null, 20]);
});

test('toColumns with no series keeps only the time column', () => {
  assert.deepEqual(toColumns(parseSeries('5|1.0'), []), [[5]]);
});

test('valuesOf collects the values of the asked series and skips the gaps', () => {
  const points = parseSeries('0|10.0|20.0\n100|||30.0');
  assert.deepEqual(valuesOf(points, ['cpu', 'battery']), [10, 30]);
  assert.deepEqual(valuesOf(points, ['gpu']), [20]);
  assert.deepEqual(valuesOf(parseSeries('0|||'), ['cpu', 'gpu', 'battery']), []);
});
