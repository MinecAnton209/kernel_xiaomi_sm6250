import { TUNE, quote } from '../core/config';
import { byId, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { toast } from '../core/toast';
import { t } from '../logic/i18n';
import { TUNE_DOCS, type TuneDoc } from '../logic/tuneDocs';
import { parseDefaults, parseDump, rangeOf, type TuneState } from '../logic/tuneDump';
import {
  canUseDefaults,
  defaultEdits,
  isValidChoice,
  pendingChanges,
  pruneEdits,
  recordEdit,
  shownValue,
  type Edits,
} from '../logic/tuneEdits';
import { hideSkeleton, showSkeleton } from '../ui/skeleton';

/** The part of m3e-select this page uses; its value is a string in single-select mode. */
interface M3eSelect extends HTMLElement {
  value: string;
  disabled: boolean;
}

type Control = M3eSelect | HTMLInputElement;

const DUMP_TIMEOUT_MS = 10_000;
const ORDER = TUNE_DOCS.map((doc) => doc.key);

// Kept until the WebUI page is closed, so switching tabs never reads sysfs again.
let cache: Map<string, TuneState> | undefined;
let defaults: Map<string, string> = new Map();
let pending: Promise<Map<string, TuneState>> | undefined;

// What the user picked and has not saved. The controls only show it; it is applied by Save.
const edits: Edits = new Map();
const controls = new Map<string, Control>();
let saving = false;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readAll(force = false): Promise<Map<string, TuneState>> {
  if (cache && !force) return Promise.resolve(cache);
  // A second call while the first is still running shares its result instead of starting another shell.
  pending ??= withTimeout(exec(joinCommands([`${quote(TUNE)} dump`, `${quote(TUNE)} defaults`])), DUMP_TIMEOUT_MS)
    .then(({ stdout }) => {
      const [dump = '', remembered = ''] = splitSections(stdout);
      const states = parseDump(dump);
      cache = states;
      defaults = parseDefaults(remembered);
      return states;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function note(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'hint';
  paragraph.textContent = text;
  return paragraph;
}

function buildControl(state: TuneState, value: string): Control {
  const range = rangeOf(state.options);
  if (range) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'field';
    input.min = String(range.min);
    input.max = String(range.max);
    input.value = value;
    return input;
  }

  const select = document.createElement('m3e-select') as M3eSelect;
  for (const option of state.options) {
    const item = document.createElement('m3e-option');
    item.setAttribute('value', option);
    item.textContent = option;
    select.append(item);
  }
  select.value = value;
  return select;
}

/** A select needs its form field for the outline and the arrow; a number input stands alone. */
function wrapControl(control: Control): HTMLElement {
  if (control instanceof HTMLInputElement) return control;
  const field = document.createElement('m3e-form-field');
  field.setAttribute('variant', 'outlined');
  field.setAttribute('hide-subscript', '');
  field.className = 'tune-select';
  field.append(control);
  return field;
}

function changes() {
  return cache ? pendingChanges(ORDER, cache, edits) : [];
}

/** Brings the buttons, the counter and the marks on the rows in line with the pending edits. */
function refreshBar(): void {
  const states = cache;
  const count = changes().length;

  for (const [key, control] of controls) {
    control.closest('.tune-row')?.classList.toggle('changed', edits.has(key));
    control.disabled = saving;
  }

  byId('tuneActions').hidden = !states || controls.size === 0;
  byId('tunePending').textContent = count > 0 ? t('tune.pending', { count }) : '';
  byId<Togglable>('tuneSave').disabled = saving || count === 0;
  byId<Togglable>('tuneReset').disabled = saving || count === 0;
  byId<Togglable>('tuneDefaults').disabled = saving || !states || !canUseDefaults(ORDER, states, defaults, edits);
}

function onChoice(doc: TuneDoc, control: Control, state: TuneState, committed: boolean): void {
  const range = rangeOf(state.options);
  if (committed && range && control instanceof HTMLInputElement && control.value !== '') {
    // A number typed past the bounds is pulled back when the field is left, as a native spinner would.
    control.value = String(Math.min(range.max, Math.max(range.min, Math.round(Number(control.value)))));
  }
  if (isValidChoice(state, control.value)) {
    recordEdit(edits, doc.key, control.value, state.current);
  } else {
    // An empty or half typed number is not a choice yet; the kernel keeps its value meanwhile.
    edits.delete(doc.key);
  }
  refreshBar();
}

function renderRow(doc: TuneDoc, state: TuneState | undefined): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tune-row';

  const title = document.createElement('strong');
  title.textContent = t(doc.title);
  row.append(title, note(t(doc.hint)));

  if (!state || state.options.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip off';
    chip.textContent = t('tune.unsupported');
    row.append(chip);
    return row;
  }

  const control = buildControl(state, shownValue(state, doc.key, edits));
  control.addEventListener('input', () => onChoice(doc, control, state, false));
  control.addEventListener('change', () => onChoice(doc, control, state, true));
  controls.set(doc.key, control);
  row.append(wrapControl(control));
  return row;
}

function renderList(states: Map<string, TuneState>): void {
  controls.clear();
  byId('tuneList').replaceChildren(...TUNE_DOCS.map((doc) => renderRow(doc, states.get(doc.key))));
  refreshBar();
}

/** Puts the controls back in line with the edits, after the edits were replaced as a whole. */
function syncControls(): void {
  if (!cache) return;
  for (const [key, control] of controls) {
    const state = cache.get(key);
    if (state) control.value = shownValue(state, key, edits);
  }
  refreshBar();
}

/**
 * Starts reading the settings as soon as the page opens, so they are usually ready by the
 * time the Tuning tab is opened. A failure is ignored here; opening the tab tries again.
 */
export function prefetchTune(): void {
  readAll().catch(() => undefined);
}

export async function loadTune(force = false): Promise<void> {
  const list = byId('tuneList');
  // With cached rows on screen a forced reload keeps them until the new values arrive.
  if (!cache) showSkeleton('tuneList');

  try {
    const states = await readAll(force);
    // A reload may bring the value the user had picked; that edit is then no longer pending.
    pruneEdits(edits, states);
    renderList(states);
  } catch {
    controls.clear();
    list.replaceChildren(note(t('tune.readFailed')));
    refreshBar();
  } finally {
    hideSkeleton('tuneList');
  }
}

/** Re-reads the kernel even when values are cached; used by pull to refresh. */
export function reloadTune(): Promise<void> {
  return loadTune(true);
}

/** True while the Tuning tab holds choices that were not saved. */
export function hasUnsavedTune(): boolean {
  return changes().length > 0;
}

/**
 * Applies and remembers every pending choice with one root shell. A setting that fails keeps its
 * choice on screen so it can be tried again. Resolves to true when everything was saved.
 */
export async function saveTune(): Promise<boolean> {
  const states = cache;
  const pendingNow = changes();
  if (!states || pendingNow.length === 0 || saving) return pendingNow.length === 0;

  saving = true;
  refreshBar();
  let failed = 0;
  try {
    const result = await exec(
      joinCommands(pendingNow.map(({ key, value }) => `${quote(TUNE)} set ${key} ${quote(value)} >/dev/null 2>&1; echo $?`)),
    );
    const codes = splitSections(result.stdout);
    pendingNow.forEach(({ key, value }, index) => {
      const state = states.get(key);
      if (codes[index] === '0' && state) {
        state.current = value;
        edits.delete(key);
      } else {
        failed += 1;
      }
    });
  } finally {
    saving = false;
    refreshBar();
  }
  toast(failed > 0 ? t('tune.saveFailed', { count: failed }) : t('tune.saved'));
  return failed === 0;
}

/** Drops every pending choice; the controls go back to what the kernel has. */
export function discardTune(): void {
  edits.clear();
  syncControls();
}

/** Fills in the values the kernel booted with. They are only choices until Save applies them. */
function useDefaults(): void {
  if (!cache) return;
  edits.clear();
  for (const [key, value] of defaultEdits(ORDER, cache, defaults)) edits.set(key, value);
  syncControls();
}

export function initTuneActions(): void {
  byId('tuneSave').addEventListener('click', () => void saveTune());
  byId('tuneReset').addEventListener('click', discardTune);
  byId('tuneDefaults').addEventListener('click', useDefaults);
}

function renderHelp(): void {
  const body = byId('tuneHelpBody');
  const nodes: HTMLElement[] = [note(t('tune.helpIntro'))];

  for (const doc of TUNE_DOCS) {
    const item = document.createElement('div');
    item.className = 'help-item';

    const heading = document.createElement('h3');
    heading.textContent = t(doc.title);
    const about = document.createElement('p');
    about.textContent = t(doc.about);

    const values = document.createElement('dl');
    values.className = 'help-values';
    for (const { value, text } of doc.values) {
      const term = document.createElement('dt');
      term.textContent = value;
      const detail = document.createElement('dd');
      detail.textContent = t(text);
      values.append(term, detail);
    }

    const advice = document.createElement('p');
    advice.className = 'help-advice';
    advice.textContent = t('tune.advice', { text: t(doc.advice) });

    item.append(heading, about, values, advice);
    nodes.push(item);
  }
  body.replaceChildren(...nodes);
}

function showHelp(visible: boolean): void {
  byId('tuneMain').hidden = visible;
  byId('tuneHelp').hidden = !visible;
}

export function initTuneHelp(): void {
  renderHelp();
  byId('tuneHelpBtn').addEventListener('click', () => showHelp(true));
  byId('tuneHelpBack').addEventListener('click', () => showHelp(false));
}
