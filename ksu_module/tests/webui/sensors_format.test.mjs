import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSensors, sensorSpecs, thermalGroup } from '../../webui/src/logic/sensorsFormat.ts';

const FULL = [
  'thermal=gpuss-0-usr|39500',
  'thermal=cpu0-silver-usr|41000',
  'thermal=cpu7-gold-usr|43250',
  'thermal=ddr-usr|36000',
  'thermal=quiet_therm|35000',
  'cpu_freq=7|2208000',
  'cpu_freq=0|1804800',
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
  const sensors = parseSensors(FULL);
  const cpu = sensors.thermal.find((zone) => zone.name === 'cpu0-silver-usr');
  assert.deepEqual(cpu, { name: 'cpu0-silver-usr', celsius: 41, group: 'cpu' });
});

test('parseSensors sorts thermal zones by name and cores by number', () => {
  const sensors = parseSensors(FULL);
  assert.deepEqual(
    sensors.thermal.map((zone) => zone.name),
    ['cpu0-silver-usr', 'cpu7-gold-usr', 'ddr-usr', 'gpuss-0-usr', 'quiet_therm'],
  );
  assert.deepEqual(sensors.cores, [
    { core: 0, mhz: 1805 },
    { core: 7, mhz: 2208 },
  ]);
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
    ['thermal=|41000', 'thermal=cpu0|abc', 'cpu_freq=x|1000', 'gpu_freq=', 'no equals here', 'mem_total_kb=12'].join('\n'),
  );
  assert.deepEqual(sensors.thermal, []);
  assert.deepEqual(sensors.cores, []);
  assert.equal(sensors.gpuMhz, undefined);
  assert.equal(sensors.memTotalMb, 0);
});

test('parseSensors treats empty output as nothing to show', () => {
  assert.deepEqual(parseSensors(''), { thermal: [], cores: [] });
});

test('sensorSpecs shows group summaries first and then every raw zone', () => {
  const specs = sensorSpecs(parseSensors(FULL));
  const keys = specs.map((spec) => spec.key);
  assert.deepEqual(keys.slice(0, 4), ['sum-cpu', 'sum-gpu', 'sum-ram', 'sum-battery']);
  assert.ok(keys.includes('zone-quiet_therm'));
  assert.ok(keys.includes('cpu-0'));
  assert.ok(keys.includes('gpu-clock'));
});

test('sensorSpecs formats the hottest CPU zone as the CPU summary', () => {
  const spec = sensorSpecs(parseSensors(FULL)).find((item) => item.key === 'sum-cpu');
  assert.equal(spec?.text, 'cpu temp: 43.3 °C');
});

test('sensorSpecs leaves out groups the kernel has no sensor for', () => {
  const specs = sensorSpecs(parseSensors('thermal=quiet_therm|35000'));
  assert.deepEqual(
    specs.map((spec) => spec.key),
    ['zone-quiet_therm'],
  );
});

test('sensorSpecs shows the GPU maximum only when the kernel reports it', () => {
  const without = sensorSpecs(parseSensors('gpu_freq=600000000')).find((item) => item.key === 'gpu-clock');
  assert.equal(without?.text, 'gpu: 600 MHz');
  const withMax = sensorSpecs(parseSensors('gpu_freq=600000000\ngpu_max_freq=950000000')).find(
    (item) => item.key === 'gpu-clock',
  );
  assert.equal(withMax?.text, 'gpu: 600 MHz (max 950 MHz)');
});
