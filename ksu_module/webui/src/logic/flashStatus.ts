export type FlashState = 'running' | 'done' | 'error' | '';

export interface FlashPoll {
  state: FlashState;
  /** Whether the flashing script is still running. */
  alive: boolean;
  /** The last lines of the installer's output, as written to the log. */
  log: string;
}

export type FlashOutcome = 'running' | 'done' | 'error' | 'died';

/** How long the script gets to write its pid and state before a missing process counts as dead. */
export const STARTUP_GRACE_MS = 10_000;

/**
 * Parses the poll command's output: a first line `<state>|<alive>`, then the tail of the log.
 * An unknown state is read as not started yet.
 */
export function parseFlashPoll(stdout: string): FlashPoll {
  const lines = stdout.replace(/\r/g, '').split('\n');
  const [state = '', alive = '0'] = (lines[0] ?? '').split('|');
  const known: FlashState = state === 'running' || state === 'done' || state === 'error' ? state : '';
  return { state: known, alive: alive.trim() === '1', log: lines.slice(1).join('\n').trimEnd() };
}

/**
 * What a poll means. A finished state wins over a dead process, because the script exits right
 * after writing it. A script that is gone while still "running" has been killed or crashed.
 */
export function flashOutcome(poll: FlashPoll, seenAlive: boolean, elapsedMs: number): FlashOutcome {
  if (poll.state === 'done') return 'done';
  if (poll.state === 'error') return 'error';
  if (!poll.alive && (seenAlive || elapsedMs > STARTUP_GRACE_MS)) return 'died';
  return 'running';
}

/** The last line of the log that says something, for the short message under the title. */
export function lastLogLine(log: string): string {
  const lines = log
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines[lines.length - 1] ?? '';
}
