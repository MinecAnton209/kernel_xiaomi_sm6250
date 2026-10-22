import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const css = readFileSync(join(SRC, 'src', 'style.css'), 'utf8');
const html = readFileSync(join(SRC, 'index.html'), 'utf8');

const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose selector list contains `selector` exactly. */
function declarations(selector) {
  for (const match of cssRules.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return undefined;
}

test('the loading indicator is never squeezed by a flex row', () => {
  // Shrunk to 32 px, its 38 px round container cut the corners off shapes that reach 19 px.
  const rule = declarations('m3e-loading-indicator');
  assert.ok(rule, 'there is no rule for m3e-loading-indicator');
  assert.match(rule, /flex:\s*none/);
});

test('a row of buttons wraps instead of overflowing the card', () => {
  const rule = declarations('.row.end');
  assert.ok(rule, 'there is no rule for .row.end');
  assert.match(rule, /flex-wrap:\s*wrap/);
});

test('the update check spinner wraps together with its button', () => {
  assert.match(html, /<span class="check-group">\s*<m3e-loading-indicator id="checkSpinner"[^>]*><\/m3e-loading-indicator>\s*<m3e-button id="checkUpdatesBtn"/);
  const rule = declarations('.check-group');
  assert.ok(rule, 'there is no rule for .check-group');
  assert.match(rule, /display:\s*flex/);
});

test('the loading indicator has no size override that would change its container', () => {
  assert.ok(!/--m3e-loading-indicator-(size|container-size|active-indicator-size)/.test(css));
});

test('every loading indicator has an accessible label', () => {
  const tags = [...html.matchAll(/<m3e-loading-indicator\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(tags.length >= 2, 'expected the update check and the pull indicator');
  for (const tag of tags) assert.match(tag, /aria-label="[^"]+"/, tag);
});
