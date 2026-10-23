import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

const SHIPPED_WITH = {
  'm3e-linear-progress-indicator': 'progress-indicator',
  'm3e-circular-progress-indicator': 'progress-indicator',
};

test('every m3e element used in the markup is registered by an import in main.ts', () => {
  const tags = new Set([...read('index.html').matchAll(/<(m3e-[a-z-]+)/g)].map((match) => match[1]));
  const imports = new Set([...read('src/main.ts').matchAll(/import '@m3e\/web\/([a-z-]+)';/g)].map((match) => match[1]));
  assert.ok(tags.size > 0);
  for (const tag of tags) {
    // Some elements ship inside a sibling component: m3e-dialog-action is part of the dialog, and the
    // progress bars are part of progress-indicator.
    const component = SHIPPED_WITH[tag] ?? tag.replace(/^m3e-/, '').replace(/-action$/, '');
    assert.ok(imports.has(component), `${tag} is used in index.html but @m3e/web/${component} is not imported in main.ts`);
  }
});
