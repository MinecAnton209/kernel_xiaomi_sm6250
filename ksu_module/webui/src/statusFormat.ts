import type { ChipSpec } from './chargeFormat';

/** One chip per `name=0|1` line; the name is the key, so a refresh updates chips in place. */
export function featureSpecs(text: string): ChipSpec[] {
  const specs: ChipSpec[] = [];
  for (const line of text.split('\n')) {
    const [key, value] = line.split('=');
    if (!key || value === undefined) continue;
    specs.push({ key, text: key.replaceAll('_', ' '), state: value.trim() === '1' ? 'ok' : 'off' });
  }
  return specs;
}
