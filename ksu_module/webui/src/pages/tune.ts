import { TUNE, quote } from '../core/config';
import { byId } from '../core/dom';
import { exec, run } from '../core/ksu';
import { TUNE_DOCS, type TuneDoc } from '../logic/tuneDocs';
import { parseDump, rangeOf, type TuneState } from '../logic/tuneDump';
import { hideSkeleton, showSkeleton } from '../ui/skeleton';

/** The part of m3e-select this page uses; its value is a string in single-select mode. */
interface M3eSelect extends HTMLElement {
  value: string;
  disabled: boolean;
}

type Control = M3eSelect | HTMLInputElement;

const DUMP_TIMEOUT_MS = 10_000;

// Kept until the WebUI page is closed, so switching tabs never reads sysfs again.
let cache: Map<string, TuneState> | undefined;
let pending: Promise<Map<string, TuneState>> | undefined;

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
  pending ??= withTimeout(exec(`${quote(TUNE)} dump`), DUMP_TIMEOUT_MS)
    .then(({ stdout }) => {
      const states = parseDump(stdout);
      cache = states;
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

function buildControl(state: TuneState): Control {
  const range = rangeOf(state.options);
  if (range) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'field';
    input.min = String(range.min);
    input.max = String(range.max);
    input.value = state.current;
    return input;
  }

  const select = document.createElement('m3e-select') as M3eSelect;
  for (const option of state.options) {
    const item = document.createElement('m3e-option');
    item.setAttribute('value', option);
    item.textContent = option;
    select.append(item);
  }
  select.value = state.current;
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

async function apply(doc: TuneDoc, control: Control): Promise<void> {
  control.disabled = true;
  try {
    const result = await run(
      `${quote(TUNE)} set ${doc.key} ${quote(control.value)}`,
      `${doc.title}: ${control.value}`,
    );
    const state = cache?.get(doc.key);
    if (result.errno === 0) {
      if (state) state.current = control.value;
      return;
    }
    const { stdout } = await exec(`${quote(TUNE)} get ${doc.key}`);
    const actual = stdout.trim();
    control.value = actual;
    if (state) state.current = actual;
  } finally {
    control.disabled = false;
  }
}

function renderRow(doc: TuneDoc, state: TuneState | undefined): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tune-row';

  const title = document.createElement('strong');
  title.textContent = doc.title;
  row.append(title, note(doc.hint));

  if (!state || state.options.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip off';
    chip.textContent = 'ядро не поддерживает';
    row.append(chip);
    return row;
  }

  const control = buildControl(state);
  control.addEventListener('change', () => void apply(doc, control));
  row.append(wrapControl(control));
  return row;
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
    list.replaceChildren(...TUNE_DOCS.map((doc) => renderRow(doc, states.get(doc.key))));
  } catch {
    list.replaceChildren(note('Не удалось прочитать настройки ядра. Откройте вкладку ещё раз.'));
  } finally {
    hideSkeleton('tuneList');
  }
}

/** Re-reads the kernel even when values are cached; used by pull to refresh. */
export function reloadTune(): Promise<void> {
  return loadTune(true);
}

function renderHelp(): void {
  const body = byId('tuneHelpBody');
  const nodes: HTMLElement[] = [
    note(
      'Значения применяются сразу и сохраняются: после каждой загрузки модуль возвращает их через несколько секунд. Чтобы вернуть прежнее поведение, выберите другое значение; после перезагрузки применится то, что выбрано сейчас.',
    ),
  ];

  for (const doc of TUNE_DOCS) {
    const item = document.createElement('div');
    item.className = 'help-item';

    const heading = document.createElement('h3');
    heading.textContent = doc.title;
    const about = document.createElement('p');
    about.textContent = doc.about;

    const values = document.createElement('dl');
    values.className = 'help-values';
    for (const [value, description] of Object.entries(doc.values)) {
      const term = document.createElement('dt');
      term.textContent = value;
      const detail = document.createElement('dd');
      detail.textContent = description;
      values.append(term, detail);
    }

    const advice = document.createElement('p');
    advice.className = 'help-advice';
    advice.textContent = `Совет: ${doc.advice}`;

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
