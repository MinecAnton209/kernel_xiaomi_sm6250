import type { ChipSpec } from './chargeFormat';

/** One chip per `name=0|1` line; the name is the key, so a refresh updates chips in place. */
/** `build_version=` from the kernel, such as `1.0.0` or `1.0.0-3f9a2c1`; undefined on a kernel too old to answer. */
export function buildVersion(text: string): string | undefined {
  const version = /^build_version=(.+)$/m.exec(text)?.[1]?.trim();
  return version ? version : undefined;
}

/** The build version and, when the kernel knows it, the commit it was built from. */
export function buildLabel(text: string): string | undefined {
  const version = buildVersion(text);
  if (version === undefined) return undefined;
  const commit = /^build_commit=(.+)$/m.exec(text)?.[1]?.trim();
  return commit && commit !== 'unknown' ? `${version} (${commit})` : version;
}

export function featureSpecs(text: string): ChipSpec[] {
  const specs: ChipSpec[] = [];
  for (const line of text.split('\n')) {
    const [key, value] = line.split('=');
    if (!key || value === undefined) continue;
    specs.push({ key, text: key.replaceAll('_', ' '), state: value.trim() === '1' ? 'ok' : 'off' });
  }
  return specs;
}
