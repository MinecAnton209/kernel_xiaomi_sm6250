import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fraction,
  hottest,
  memoryUsed,
  parseSensors,
  tempLevel,
  thermalGroup,
} from '../../webui/src/logic/sensorsFormat.ts';

const FULL = [
  'thermal=gpuss-0-usr|39500',
  'thermal=cpu0-silver-usr|41000',
  'thermal=cpu7-gold-usr|43250',
  'thermal=ddr-usr|36000',
  'thermal=quiet_therm|35000',
  'cpu_freq=7|2208000',
  'cpu_freq=0|1804800',
  'cpu_max=0|1804800',
  'cpu_max=7|2400000',
  'gpu_freq=600000000',
  'gpu_max_freq=950000000',
  'mem_total_kb=5731008',
  'mem_avail_kb=2891000',
  'battery_temp=318',
].join('\n');

test('thermalGroup puts CPU, GPU and RAM sensors into their groups by name', () => {
  assert.equal(thermalGroup('cpu0-silver-usr'), 'cpu');
  assert.equal(thermalGroup('cpu7-gold-usr'), 'cpu');
  assert.equal(thermalGroup('gpuss-0-usr'), 'gpu');
  assert.equal(thermalGroup('kgsl-hwcf'), 'gpu');
  assert.equal(thermalGroup('ddr-usr'), 'ram');
  assert.equal(thermalGroup('quiet_therm'), 'other');
});

test('parseSensors converts thermal milli degrees to degrees and keeps the group', () => {
  const cpu = parseSensors(FULL).thermal.find((zone) => zone.name === 'cpu0-silver-usr');
  assert.deepEqual(cpu, { name: 'cpu0-silver-usr', celsius: 41, group: 'cpu' });
});

test('parseSensors sorts thermal zones by name and cores by number', () => {
  const sensors = parseSensors(FULL);
  assert.deepEqual(
    sensors.thermal.map((zone) => zone.name),
    ['cpu0-silver-usr', 'cpu7-gold-usr', 'ddr-usr', 'gpuss-0-usr', 'quiet_therm'],
  );
  assert.deepEqual(
    sensors.cores.map((core) => core.core),
    [0, 7],
  );
});

test('parseSensors attaches each core its maximum frequency in MHz', () => {
  assert.deepEqual(parseSensors(FULL).cores, [
    { core: 0, mhz: 1805, maxMhz: 1805 },
    { core: 7, mhz: 2208, maxMhz: 2400 },
  ]);
});

test('parseSensors leaves a core without a maximum undefined', () => {
  const sensors = parseSensors('cpu_freq=3|1000000');
  assert.equal(sensors.cores[0]?.maxMhz, undefined);
});

test('parseSensors reports GPU clocks in MHz and memory in MB', () => {
  const sensors = parseSensors(FULL);
  assert.equal(sensors.gpuMhz, 600);
  assert.equal(sensors.gpuMaxMhz, 950);
  assert.equal(sensors.memTotalMb, 5597);
  assert.equal(sensors.memAvailMb, 2823);
});

test('parseSensors reads the battery temperature from tenths of a degree', () => {
  assert.equal(parseSensors('battery_temp=318').batteryCelsius, 31.8);
});

test('parseSensors keeps a negative battery temperature', () => {
  assert.equal(parseSensors('battery_temp=-40').batteryCelsius, -4);
});

test('parseSensors skips lines it cannot read instead of failing', () => {
  const sensors = parseSensors(
    ['thermal=|41000', 'thermal=cpu0|abc', 'cpu_freq=x|1000', 'cpu_max=x|1000', 'gpu_freq=', 'no equals here'].join('\n'),
  );
  assert.deepEqual(sensors.thermal, []);
  assert.deepEqual(sensors.cores, []);
  assert.equal(sensors.gpuMhz, undefined);
});

test('parseSensors treats empty output as nothing to show', () => {
  assert.deepEqual(parseSensors(''), { thermal: [], cores: [] });
});

test('hottest returns the highest zone of a group and nothing for an absent group', () => {
  const zones = parseSensors(FULL).thermal;
  assert.equal(hottest(zones, 'cpu'), 43.25);
  assert.equal(hottest(zones, 'gpu'), 39.5);
  assert.equal(hottest(zones, 'ram'), 36);
  assert.equal(hottest([], 'cpu'), undefined);
});

test('tempLevel is cool below 45 degrees, warm below 60 and hot from there on', () => {
  assert.equal(tempLevel(30), 'cool');
  assert.equal(tempLevel(44.9), 'cool');
  assert.equal(tempLevel(45), 'warm');
  assert.equal(tempLevel(59.9), 'warm');
  assert.equal(tempLevel(60), 'hot');
  assert.equal(tempLevel(80), 'hot');
});

test('fraction is the value over the maximum, clamped to the range from 0 to 1', () => {
  assert.equal(fraction(50, 100), 0.5);
  assert.equal(fraction(150, 100), 1);
  assert.equal(fraction(-5, 100), 0);
});

test('fraction is undefined when a side is unknown or the maximum is not positive', () => {
  assert.equal(fraction(undefined, 100), undefined);
  assert.equal(fraction(50, undefined), undefined);
  assert.equal(fraction(50, 0), undefined);
});

test('memoryUsed is the part of total memory that is not available', () => {
  const used = memoryUsed(parseSensors(FULL));
  assert.ok(Math.abs((used ?? 0) - (5597 - 2823) / 5597) < 1e-9);
  assert.equal(memoryUsed(parseSensors('')), undefined);
});
