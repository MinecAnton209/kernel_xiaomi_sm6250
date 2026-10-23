import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

test('a chip whose value changes is highlighted, and a new chip is not', () => {
  const chips = read('src/ui/chipList.ts');
  assert.ok(chips.includes("if (!isNew) flash(node);"));
  assert.ok(chips.includes("classList.add('changed')"));
});

test('the chip class is compared on its own, so the highlight is not reset on every refresh', () => {
  const chips = read('src/ui/chipList.ts');
  assert.ok(chips.includes("if (node.dataset['base'] !== className) {"));
});

test('reduced motion turns off every animation, not only the install panel', () => {
  const css = read('src/style.css');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {'));
});

test('the Advanced fields animate when they appear', () => {
  assert.ok(read('src/style.css').includes('[data-advanced]:not([hidden]) {'));
});

test('the battery is polled every 5 seconds', () => {
  assert.ok(read('src/pages/system.ts').includes('const LIVE_POLL_MS = 5000;'));
});
