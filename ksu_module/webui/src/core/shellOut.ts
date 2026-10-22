/** Echoed between commands, so several outputs come back from one root shell. */
export const SECTION_MARK = '@@kc@@';

/** Joins commands so they run in one shell; read the result back with `splitSections`. */
export function joinCommands(commands: readonly string[]): string {
  return commands.join(`; echo ${SECTION_MARK}; `);
}

/** One trimmed section per command, in order; a command with no output gives an empty section. */
export function splitSections(stdout: string): string[] {
  return stdout.split(SECTION_MARK).map((section) => section.trim());
}
