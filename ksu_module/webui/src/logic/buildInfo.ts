export type UpdateChannel = 'release' | 'ci';

/** The rolling pre-release has this tag; it names no version, only "the newest build". */
export const ROLLING_TAG = 'unreleased';

/** The CI run number in the name of a published file: `kernel_control-48.zip` is 48. */
export function buildNumberOf(assetName: string): number | undefined {
  const match = /-(\d+)\.[A-Za-z.]+$/.exec(assetName);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** The `build=` line a CI build writes into module.prop, or the old record of the installed zip's name. */
export function installedBuild(prop: string, recordedAsset: string): number | undefined {
  const fromProp = /^build=(\d+)\s*$/m.exec(prop)?.[1];
  if (fromProp !== undefined) return Number(fromProp);
  return buildNumberOf(recordedAsset.trim());
}

/**
 * True when the module on the phone is the one this release offers. Releases are compared by
 * version. The rolling pre-release has no version, so a CI build is compared by run number; when
 * the phone cannot tell which build it has (a module installed by hand from an older zip), it is
 * not up to date, so the user gets the update that records it.
 */
export function moduleIsCurrent(input: {
  channel: UpdateChannel;
  version: string;
  build: number | undefined;
  tag: string;
  assetName: string;
}): boolean {
  if (input.channel === 'release') return input.version === input.tag;
  const offered = buildNumberOf(input.assetName);
  return offered !== undefined && input.build === offered;
}

/**
 * The run number of an offered file when it comes from the rolling pre-release, whose tag names
 * no version. Undefined for a tagged release.
 */
export function rollingBuildNumber(tag: string, assetName: string): number | undefined {
  return tag.toLowerCase() === ROLLING_TAG ? buildNumberOf(assetName) : undefined;
}

/** How an offered file is named to the user. */
export type Offer =
  | { kind: 'version'; text: string }
  | { kind: 'build'; number: number }
  | { kind: 'tag'; text: string };

/**
 * What to call an offered file. Best is its own version (`v1.1.0-7ae22c4`, which the manifest takes
 * from the module.prop inside the zip); then, for the rolling pre-release, its run number, because
 * "unreleased" says nothing about which build it is; otherwise the tag.
 */
export function describeOffer(tag: string, assetName: string, version?: string | null): Offer {
  const own = (version ?? '').trim();
  if (own !== '') return { kind: 'version', text: own };
  const number = rollingBuildNumber(tag, assetName);
  return number === undefined ? { kind: 'tag', text: tag } : { kind: 'build', number };
}

export type KernelStatus =
  | { kind: 'offer'; offered: string }
  | { kind: 'current'; current: string }
  | { kind: 'update'; current: string; offered: string };

/**
 * The kernel panel: the running build against the offered one. A kernel too old to report its build
 * (`running` undefined) can only be offered.
 */
export function kernelStatus(running: string | undefined, offered: string): KernelStatus {
  if (running === undefined) return { kind: 'offer', offered };
  return running === offered ? { kind: 'current', current: running } : { kind: 'update', current: running, offered };
}
