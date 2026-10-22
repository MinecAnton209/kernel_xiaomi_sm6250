import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui', 'src');

/**
 * Which folders each folder may import from. A folder always may import from itself.
 *   core   the bridge to the manager and what every file shares
 *   logic  pure functions and data, with no DOM: this is what the Node tests exercise
 *   ui     widgets that pages share
 *   pages  one file per tab
 *   (root) main.ts and nav.ts, the app shell, which may use everything
 */
const MAY_IMPORT = {
  core: ['core'],
  logic: ['logic'],
  ui: ['core', 'logic', 'ui'],
  pages: ['core', 'logic', 'ui', 'pages'],
  '': ['core', 'logic', 'ui', 'pages', ''],
};
const ROOT_FILES = ['globals.d.ts', 'main.ts', 'nav.ts', 'style.css'];

function sources(dir = SRC) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (name.endsWith('.ts') || name.endsWith('.css')) found.push(path);
  }
  return found;
}

const folderOf = (file) => relative(SRC, dirname(file)).split(sep)[0] ?? '';

function importsOf(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specifiers = [...text.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)].map((match) => match[1]);
  return specifiers.map((specifier) => resolve(dirname(file), specifier));
}

const tsFiles = sources().filter((file) => file.endsWith('.ts'));

test('the source tree has the folders this test knows about', () => {
  const folders = new Set(sources().map(folderOf));
  assert.deepEqual([...folders].sort(), ['', 'core', 'logic', 'pages', 'ui']);
});

test('only the app shell lives in the root of src', () => {
  const root = readdirSync(SRC).filter((name) => statSync(join(SRC, name)).isFile());
  assert.deepEqual(root.sort(), [...ROOT_FILES].sort());
});

test('no folder imports from a folder it should not depend on', () => {
  const violations = [];
  for (const file of tsFiles) {
    const from = folderOf(file);
    for (const target of importsOf(file)) {
      const to = relative(SRC, target).split(sep).length > 1 ? relative(SRC, target).split(sep)[0] : '';
      if (!MAY_IMPORT[from].includes(to)) {
        violations.push(`${relative(SRC, file)} imports from ${to || 'the root'}/ (${relative(SRC, target)})`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('nothing but the app shell is imported from the root', () => {
  // A page or a widget that imports nav.ts or main.ts would tie the layers into a loop.
  const offenders = tsFiles
    .filter((file) => folderOf(file) !== '')
    .flatMap((file) => importsOf(file).map((target) => [file, target]))
    .filter(([, target]) => relative(SRC, target).split(sep).length === 1)
    .map(([file, target]) => `${relative(SRC, file)} -> ${relative(SRC, target)}`);
  assert.deepEqual(offenders, []);
});

test('the pure logic never touches the DOM', () => {
  const touching = tsFiles
    .filter((file) => folderOf(file) === 'logic')
    .filter((file) => /\b(document|window|navigator|localStorage|sessionStorage)\s*[.[]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file));
  assert.deepEqual(touching, []);
});

test('every file in the pure folders can be loaded by Node without a DOM', async () => {
  for (const file of tsFiles.filter((candidate) => ['logic', 'core'].includes(folderOf(candidate)))) {
    // dom.ts, ksu.ts and toast.ts need the page; the others are plain modules.
    if (/(dom|ksu|toast)\.ts$/.test(file)) continue;
    await assert.doesNotReject(import(file), `${relative(SRC, file)} failed to load in Node`);
  }
});
