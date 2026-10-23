export const PROFILE_NAMES = ['default', 'performance', 'battery'] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

/** The profile `profile.sh current` printed, or undefined when it names none of the known profiles. */
export function activeProfile(output: string): ProfileName | undefined {
  const name = output.trim();
  return (PROFILE_NAMES as readonly string[]).includes(name) ? (name as ProfileName) : undefined;
}
