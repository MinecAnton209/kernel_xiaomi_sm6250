export interface TuneState {
  current: string;
  options: string[];
}

/** Parses the tab separated lines printed by `tune.sh dump`: key, active value, options. */
export function parseDump(stdout: string): Map<string, TuneState> {
  const states = new Map<string, TuneState>();
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    const [key, current = '', options = ''] = line.split('\t');
    if (!key) continue;
    states.set(key.trim(), {
      current: current.trim(),
      options: options
        .split(' ')
        .map((option) => option.trim())
        .filter((option) => option !== ''),
    });
  }
  return states;
}

/** A numeric tunable reports its bounds as `range MIN MAX` instead of a list of values. */
export function rangeOf(options: readonly string[]): { min: number; max: number } | undefined {
  if (options.length !== 3 || options[0] !== 'range') return undefined;
  const min = Number(options[1]);
  const max = Number(options[2]);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined;
}
