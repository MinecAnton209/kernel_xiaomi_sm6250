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
 * What to call an offered build: its tag, or for the rolling pre-release the run number, since
 * "unreleased" says nothing about which build it is. Undefined means the caller shows the tag.
 */
export function rollingBuildNumber(tag: string, assetName: string): number | undefined {
  return tag.toLowerCase() === ROLLING_TAG ? buildNumberOf(assetName) : undefined;
}
