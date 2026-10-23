import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');
const html = read('index.html');
const tune = read('src/pages/tune.ts');
const nav = read('src/nav.ts');
const main = read('src/main.ts');

const dialog = html.match(/<m3e-dialog id="unsavedDialog"[\s\S]*?<\/m3e-dialog>/)?.[0] ?? '';

test('the unsaved-changes dialog exists and is an alert dialog', () => {
  assert.notEqual(dialog, '', 'no dialog with id unsavedDialog');
  assert.match(dialog, /<m3e-dialog id="unsavedDialog" alert>/);
});

test('the dialog offers stay, discard and save', () => {
  const values = [...dialog.matchAll(/return-value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, ['stay', 'discard', 'save']);
});

test('the safe answer, stay, is the one that has focus', () => {
  assert.match(dialog, /<m3e-button variant="text" autofocus>\s*<m3e-dialog-action return-value="stay"/);
  assert.equal((dialog.match(/autofocus/g) ?? []).length, 1);
});

test('the dialog has a title and a message', () => {
  assert.match(dialog, /slot="header" data-i18n="unsaved\.title"/);
  assert.match(dialog, /<p data-i18n="unsaved\.body">/);
});

test('the Tuning tab has the save, reset and defaults buttons, and the dialog component is loaded', () => {
  for (const id of ['tuneSave', 'tuneReset', 'tuneDefaults', 'tunePending', 'tuneActions']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from index.html`);
  }
  assert.ok(main.includes("import '@m3e/web/dialog';"));
});

test('the buttons start hidden, so they never show before the settings are read', () => {
  assert.match(html, /id="tuneActions"[^>]*\bhidden\b/);
});

test('a change in a control is only recorded, and nothing is written to the kernel by it', () => {
  const handler = tune.slice(tune.indexOf('function onChoice'), tune.indexOf('function renderRow'));
  assert.ok(handler.includes('recordEdit'));
  assert.ok(!/\bexec\(|\brun\(/.test(handler), 'choosing a value must not run a command');
  assert.ok(!tune.includes("control.addEventListener('change', () => void apply"), 'the old save-on-change handler is still there');
});

test('saving runs tune.sh set for the pending changes in one shell', () => {
  const save = tune.slice(tune.indexOf('export async function saveTune'), tune.indexOf('export function discardTune'));
  assert.ok(save.includes('joinCommands('), 'the changes are not joined into one shell');
  assert.ok(save.includes('} set ${key} ${quote(value)}'), 'the value must be quoted');
  assert.equal((save.match(/\bexec\(/g) ?? []).length, 1, 'one root shell for all settings');
});

test('every tab button goes through the check for unsaved changes', () => {
  assert.match(main, /addEventListener\('click', \(\) => void requestPage\(/);
  assert.ok(!/addEventListener\('click', \(\) => showPage\(/.test(main), 'a tab button still switches without asking');
});

test('only a visit to another tab from Tuning is guarded, and a failed save keeps the user there', () => {
  const guard = nav.slice(nav.indexOf('export async function requestPage'), nav.indexOf('export function savedTab'));
  assert.ok(guard.includes("activeTab === 'tune' && name !== 'tune' && hasUnsavedTune()"));
  assert.ok(guard.includes("choice === 'stay'"));
  assert.match(guard, /if \(!\(await saveTune\(\)\)\) return;/);
  assert.ok(guard.includes('discardTune()'));
  assert.ok(guard.includes('if (asking) return;'), 'taps during the question must be ignored');
});

test('the dialog texts exist in the catalogs through data-i18n', () => {
  for (const key of ['unsaved.title', 'unsaved.body', 'unsaved.stay', 'unsaved.discard', 'unsaved.save']) {
    assert.ok(html.includes(`data-i18n="${key}"`), `${key} is not used by the dialog`);
  }
});
