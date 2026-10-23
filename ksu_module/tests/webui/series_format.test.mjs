import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestPoint, parseSeries, plot, yDomain } from '../../webui/src/logic/seriesFormat.ts';

const GEOMETRY = { width: 300, height: 100, left: 0, right: 0, top: 0, bottom: 0 };

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

test('plot maps the first and last times to the left and right edges', () => {
  const points = parseSeries('0|10.0\n100|20.0');
  const [cpu] = plot(points, ['cpu'], [0, 20], GEOMETRY);
  assert.deepEqual(cpu?.paths, ['M0.0,50.0L300.0,0.0']);
  assert.equal(cpu?.last, 20);
});

test('plot starts a new path after a missing bucket instead of drawing to zero', () => {
  const points = parseSeries('0|10.0\n50|\n100|20.0');
  const [cpu] = plot(points, ['cpu'], [0, 20], GEOMETRY);
  assert.equal(cpu?.paths.length, 2);
});

test('plot gives a series with no values no paths and no last value', () => {
  const [gpu] = plot(parseSeries('0|10.0'), ['gpu'], [0, 20], GEOMETRY);
  assert.deepEqual(gpu?.paths, []);
  assert.equal(gpu?.last, undefined);
});

test('plot returns the series in the order it is asked for', () => {
  const plotted = plot(parseSeries('0|1.0|2.0|3.0'), ['battery', 'cpu'], [0, 5], GEOMETRY);
  assert.deepEqual(
    plotted.map((item) => item.key),
    ['battery', 'cpu'],
  );
});

test('plot keeps a single point visible at the left edge', () => {
  const [cpu] = plot(parseSeries('42|25.0'), ['cpu'], [0, 50], GEOMETRY);
  assert.deepEqual(cpu?.paths, ['M0.0,50.0']);
});

test('nearestPoint finds the bucket closest to a time', () => {
  const points = parseSeries('0|1.0\n100|2.0\n200|3.0');
  assert.equal(nearestPoint(points, 140)?.ts, 100);
  assert.equal(nearestPoint(points, 180)?.ts, 200);
  assert.equal(nearestPoint([], 10), undefined);
});
