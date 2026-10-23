import type { ChipSpec } from './chargeFormat';

export type ThermalGroup = 'cpu' | 'gpu' | 'ram' | 'other';

export interface ThermalZone {
  name: string;
  celsius: number;
  group: ThermalGroup;
}

export interface CoreClock {
  core: number;
  mhz: number;
}

export interface Sensors {
  thermal: ThermalZone[];
  cores: CoreClock[];
  gpuMhz?: number;
  gpuMaxMhz?: number;
  memTotalMb?: number;
  memAvailMb?: number;
  batteryCelsius?: number;
}

/** Sensor names come from the vendor tree, so the group is a guess from the name; the raw name is always shown. */
export function thermalGroup(name: string): ThermalGroup {
  if (/cpu|silver|gold|apc/i.test(name)) return 'cpu';
  if (/gpu|kgsl/i.test(name)) return 'gpu';
  if (/ddr|ram/i.test(name)) return 'ram';
  return 'other';
}

function count(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

/** Reads the `key=value` lines that bin/sensors.sh prints; a line it cannot read is skipped. */
export function parseSensors(text: string): Sensors {
  const sensors: Sensors = { thermal: [], cores: [] };

  for (const line of text.split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();

    if (key === 'thermal' || key === 'cpu_freq') {
      const [name = '', raw] = value.split('|');
      const number = count(raw);
      if (!name || number === undefined) continue;
      if (key === 'cpu_freq' && !/^\d+$/.test(name)) continue;
      if (key === 'thermal') {
        sensors.thermal.push({ name, celsius: number / 1000, group: thermalGroup(name) });
      } else {
        sensors.cores.push({ core: Number(name), mhz: Math.round(number / 1000) });
      }
      continue;
    }

    const number = count(value);
    if (number === undefined) continue;
    switch (key) {
      case 'gpu_freq':
        sensors.gpuMhz = Math.round(number / 1e6);
        break;
      case 'gpu_max_freq':
        sensors.gpuMaxMhz = Math.round(number / 1e6);
        break;
      case 'mem_total_kb':
        sensors.memTotalMb = Math.round(number / 1024);
        break;
      case 'mem_avail_kb':
        sensors.memAvailMb = Math.round(number / 1024);
        break;
      case 'battery_temp':
        sensors.batteryCelsius = number / 10;
        break;
    }
  }

  sensors.thermal.sort((a, b) => a.name.localeCompare(b.name));
  sensors.cores.sort((a, b) => a.core - b.core);
  return sensors;
}

function hottest(zones: readonly ThermalZone[], group: ThermalGroup): number | undefined {
  const temps = zones.filter((zone) => zone.group === group).map((zone) => zone.celsius);
  return temps.length === 0 ? undefined : Math.max(...temps);
}

function degrees(value: number): string {
  return `${value.toFixed(1)} °C`;
}

/** Summary chips first, then every raw thermal zone, so nothing the kernel reports is hidden. */
export function sensorSpecs(sensors: Sensors): ChipSpec[] {
  const specs: ChipSpec[] = [];
  const add = (key: string, text: string): void => {
    specs.push({ key, text, state: 'ok' });
  };

  for (const group of ['cpu', 'gpu', 'ram'] as const) {
    const max = hottest(sensors.thermal, group);
    if (max !== undefined) add(`sum-${group}`, `${group} temp: ${degrees(max)}`);
  }
  if (sensors.batteryCelsius !== undefined) {
    add('sum-battery', `battery: ${degrees(sensors.batteryCelsius)}`);
  }
  for (const core of sensors.cores) {
    add(`cpu-${core.core}`, `cpu${core.core}: ${core.mhz} MHz`);
  }
  if (sensors.gpuMhz !== undefined) {
    const max = sensors.gpuMaxMhz !== undefined ? ` (max ${sensors.gpuMaxMhz} MHz)` : '';
    add('gpu-clock', `gpu: ${sensors.gpuMhz} MHz${max}`);
  }
  if (sensors.memTotalMb !== undefined && sensors.memAvailMb !== undefined) {
    add('ram', `ram: ${sensors.memAvailMb} / ${sensors.memTotalMb} MB free`);
  }
  for (const zone of sensors.thermal) {
    add(`zone-${zone.name}`, `${zone.name}: ${degrees(zone.celsius)}`);
  }
  return specs;
}
