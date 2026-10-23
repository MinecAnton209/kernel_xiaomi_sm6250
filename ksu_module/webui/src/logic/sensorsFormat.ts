export type ThermalGroup = 'cpu' | 'gpu' | 'ram' | 'other';

export interface ThermalZone {
  name: string;
  celsius: number;
  group: ThermalGroup;
}

export interface CoreClock {
  core: number;
  mhz: number;
  maxMhz?: number;
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

export type TempLevel = 'cool' | 'warm' | 'hot';

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
  const maxByCore = new Map<number, number>();

  for (const line of text.split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();

    if (key === 'thermal' || key === 'cpu_freq' || key === 'cpu_max') {
      const [name = '', raw] = value.split('|');
      const number = count(raw);
      if (!name || number === undefined) continue;
      if (key === 'thermal') {
        sensors.thermal.push({ name, celsius: number / 1000, group: thermalGroup(name) });
      } else if (!/^\d+$/.test(name)) {
        continue;
      } else if (key === 'cpu_freq') {
        sensors.cores.push({ core: Number(name), mhz: Math.round(number / 1000) });
      } else {
        maxByCore.set(Number(name), Math.round(number / 1000));
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

  for (const core of sensors.cores) {
    core.maxMhz = maxByCore.get(core.core);
  }
  sensors.thermal.sort((a, b) => a.name.localeCompare(b.name));
  sensors.cores.sort((a, b) => a.core - b.core);
  return sensors;
}

/** The hottest zone of a group, or undefined when the kernel reports no zone for it. */
export function hottest(zones: readonly ThermalZone[], group: ThermalGroup): number | undefined {
  const temps = zones.filter((zone) => zone.group === group).map((zone) => zone.celsius);
  return temps.length === 0 ? undefined : Math.max(...temps);
}

/** Below 45 °C is cool, below 60 °C warm, and anything hotter is hot; the thresholds match where the phone starts to throttle. */
export function tempLevel(celsius: number): TempLevel {
  if (celsius < 45) return 'cool';
  if (celsius < 60) return 'warm';
  return 'hot';
}

/** A value as a fraction of the maximum, clamped to 0..1; undefined when either side is unknown or the maximum is not positive. */
export function fraction(value: number | undefined, max: number | undefined): number | undefined {
  if (value === undefined || max === undefined || max <= 0) return undefined;
  return Math.min(1, Math.max(0, value / max));
}

/** Memory in use, as a fraction of the total. */
export function memoryUsed(sensors: Sensors): number | undefined {
  if (sensors.memTotalMb === undefined || sensors.memAvailMb === undefined) return undefined;
  return fraction(sensors.memTotalMb - sensors.memAvailMb, sensors.memTotalMb);
}
