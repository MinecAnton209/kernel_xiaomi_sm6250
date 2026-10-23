import { rangeOf, type TuneState } from './tuneDump.ts';

/** Choices the user made on the Tuning tab and has not saved yet, by key. */
export type Edits = Map<string, string>;

export interface Change {
  key: string;
  value: string;
}

/** What the user answered when asked about unsaved changes before leaving the tab. */
export type UnsavedChoice = 'stay' | 'discard' | 'save';

/** Anything that is not a known answer, such as a dismissed dialog, means staying where the changes are. */
export function toUnsavedChoice(returnValue: string | null | undefined): UnsavedChoice {
  return returnValue === 'discard' || returnValue === 'save' ? returnValue : 'stay';
}

/** Keeps a choice, or drops it when the choice is the value the kernel already has. */
export function recordEdit(edits: Edits, key: string, value: string, applied: string): void {
  if (value === applied) {
    edits.delete(key);
  } else {
    edits.set(key, value);
  }
}

/** True when the kernel could take `value` for this setting. */
export function isValidChoice(state: TuneState, value: string): boolean {
  const range = rangeOf(state.options);
  if (range) {
    return /^\d+$/.test(value) && Number(value) >= range.min && Number(value) <= range.max;
  }
  return state.options.includes(value);
}

/** The edits that still change something, in the order of `order`, so they are saved in a fixed order. */
export function pendingChanges(
  order: readonly string[],
  states: ReadonlyMap<string, TuneState>,
  edits: ReadonlyMap<string, string>,
): Change[] {
  const changes: Change[] = [];
  for (const key of order) {
    const value = edits.get(key);
    const state = states.get(key);
    if (value !== undefined && state && value !== state.current) changes.push({ key, value });
  }
  return changes;
}

/** Forgets edits that equal the applied value, which happens when a reload brings the same value. */
export function pruneEdits(edits: Edits, states: ReadonlyMap<string, TuneState>): void {
  for (const [key, value] of [...edits]) {
    const state = states.get(key);
    if (!state || value === state.current) edits.delete(key);
  }
}

/** The value a setting shows: the pending choice if there is one, otherwise what the kernel has. */
export function shownValue(state: TuneState, key: string, edits: ReadonlyMap<string, string>): string {
  return edits.get(key) ?? state.current;
}

/**
 * The edits that bring every setting back to the value the kernel booted with. A setting without a
 * usable default, or already at it, has no edit, so any earlier choice for it is dropped too.
 */
export function defaultEdits(
  order: readonly string[],
  states: ReadonlyMap<string, TuneState>,
  defaults: ReadonlyMap<string, string>,
): Edits {
  const edits: Edits = new Map();
  for (const key of order) {
    const state = states.get(key);
    const value = defaults.get(key);
    if (state && value !== undefined && isValidChoice(state, value) && value !== state.current) {
      edits.set(key, value);
    }
  }
  return edits;
}

/** True when the Defaults button would change what the tab shows. */
export function canUseDefaults(
  order: readonly string[],
  states: ReadonlyMap<string, TuneState>,
  defaults: ReadonlyMap<string, string>,
  edits: ReadonlyMap<string, string>,
): boolean {
  for (const key of order) {
    const state = states.get(key);
    const value = defaults.get(key);
    if (state && value !== undefined && isValidChoice(state, value) && shownValue(state, key, edits) !== value) {
      return true;
    }
  }
  return false;
}
