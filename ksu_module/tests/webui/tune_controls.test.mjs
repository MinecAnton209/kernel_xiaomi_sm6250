import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui', 'src');
const read = (file) => readFileSync(join(SRC, file), 'utf8');

test('the tuning page builds M3E selects, not native ones', () => {
  const tune = read('pages/tune.ts');
  assert.match(tune, /createElement\('m3e-select'\)/);
  assert.match(tune, /createElement\('m3e-option'\)/);
  assert.doesNotMatch(tune, /createElement\('(select|option)'\)/);
});

test('a select is wrapped in an outlined form field', () => {
  const tune = read('pages/tune.ts');
  assert.match(tune, /createElement\('m3e-form-field'\)/);
  assert.match(tune, /setAttribute\('variant', 'outlined'\)/);
});

test('the number input of a range setting stays unwrapped', () => {
  const tune = read('pages/tune.ts');
  assert.match(tune, /control instanceof HTMLInputElement\) return control/);
});

test('the select components are registered by the app shell', () => {
  const main = read('main.ts');
  for (const name of ['form-field', 'select', 'option']) {
    assert.ok(main.includes(`import '@m3e/web/${name}';`), `${name} is not imported`);
  }
});

test('the M3E system colours the select reads follow the page palette, not the light default', () => {
  const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const token of ['on-surface', 'on-surface-variant', 'surface-container', 'tertiary-container', 'on-tertiary-container', 'outline']) {
    assert.match(css, new RegExp(`--md-sys-color-${token}:\\s*var\\(--[a-z-]+\\)`), `${token} is not mapped`);
  }
});

test('the form field of a select fills the card width', () => {
  const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.tune-select\s*\{([^}]*)\}/);
  assert.ok(rule, '.tune-select rule is missing');
  assert.match(rule[1], /width:\s*100%/);
});
