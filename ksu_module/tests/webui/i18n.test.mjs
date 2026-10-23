import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { format, getLanguage, messageKeys, pickLanguage, setLanguage, t } from '../../webui/src/logic/i18n.ts';
import { en } from '../../webui/src/logic/locales/en.ts';
import { ru } from '../../webui/src/logic/locales/ru.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const SRC = join(WEBUI, 'src');
const CYRILLIC = /[А-Яа-яЁё]/;

function sources(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

afterEach(() => setLanguage('en'));

test('the language is picked from the first supported tag', () => {
  assert.equal(pickLanguage(['ru-RU', 'en-US']), 'ru');
  assert.equal(pickLanguage(['en-GB', 'ru']), 'en');
  assert.equal(pickLanguage(['de-DE', 'ru-RU']), 'ru');
  assert.equal(pickLanguage(['RU']), 'ru');
  assert.equal(pickLanguage(['ru_RU']), 'ru');
});

test('a phone with no supported language gets English', () => {
  assert.equal(pickLanguage([]), 'en');
  assert.equal(pickLanguage(['de-DE', 'fr']), 'en');
  assert.equal(pickLanguage(['']), 'en');
});

test('t follows the language that was set', () => {
  setLanguage('ru');
  assert.equal(getLanguage(), 'ru');
  assert.equal(t('nav.status'), ru['nav.status']);
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('nav.status'), en['nav.status']);
  assert.notEqual(ru['nav.status'], en['nav.status']);
});

test('format fills each placeholder, also when it repeats', () => {
  assert.equal(format('{a} and {b} and {a}', { a: 1, b: 'two' }), '1 and two and 1');
});

test('format keeps a placeholder that has no parameter and a template without any', () => {
  assert.equal(format('{a} {missing}', { a: 'x' }), 'x {missing}');
  assert.equal(format('plain'), 'plain');
  assert.equal(format('{a}', {}), '{a}');
});

test('format writes zero and an empty string, not the placeholder', () => {
  assert.equal(format('{n}|{s}', { n: 0, s: '' }), '0|');
});

test('t passes its parameters on', () => {
  setLanguage('ru');
  assert.equal(t('status.kernel', { version: '4.14.336' }), 'ядро: 4.14.336');
  setLanguage('en');
  assert.equal(t('status.kernel', { version: '4.14.336' }), 'kernel: 4.14.336');
});

test('English and Russian have exactly the same keys', () => {
  assert.deepEqual(messageKeys('en').sort(), messageKeys('ru').sort());
});

test('every message is filled in', () => {
  for (const language of ['ru', 'en']) {
    for (const key of messageKeys(language)) {
      setLanguage(language);
      assert.ok(t(key).trim().length > 0, `${language}: ${key} is empty`);
    }
  }
});

test('both languages use the same placeholders for each key', () => {
  for (const key of Object.keys(ru)) {
    assert.deepEqual(placeholders(en[key]), placeholders(ru[key]), `${key} differs in placeholders`);
  }
});

test('the English catalog has no Russian left in it', () => {
  const leftovers = Object.entries(en).filter(([, text]) => CYRILLIC.test(text)).map(([key]) => key);
  assert.deepEqual(leftovers, []);
});

test('no Russian text is hardcoded in the sources', () => {
  const offenders = sources()
    .filter((file) => !file.endsWith(join('locales', 'ru.ts')))
    .filter((file) => CYRILLIC.test(withoutComments(readFileSync(file, 'utf8'))))
    .map((file) => relative(SRC, file));
  assert.deepEqual(offenders, []);
});

test('no Russian text is hardcoded in index.html', () => {
  const html = readFileSync(join(WEBUI, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.equal(CYRILLIC.test(html), false);
});

test('every key used by the code and by index.html exists', () => {
  const known = new Set(Object.keys(ru));
  const used = [];
  for (const file of sources()) {
    const text = withoutComments(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.push([relative(SRC, file), match[1]]);
  }
  const html = readFileSync(join(WEBUI, 'index.html'), 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)) used.push(['index.html', match[1]]);

  assert.ok(used.length > 50, 'found suspiciously few message keys');
  const unknown = used.filter(([, key]) => !known.has(key)).map(([file, key]) => `${file}: ${key}`);
  assert.deepEqual(unknown, []);
});

test('every message is used somewhere', () => {
  const haystack =
    sources()
      .filter((file) => !file.endsWith(join('locales', 'ru.ts')) && !file.endsWith(join('locales', 'en.ts')))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n') + readFileSync(join(WEBUI, 'index.html'), 'utf8');
  const unused = Object.keys(ru).filter((key) => !haystack.includes(`'${key}'`) && !haystack.includes(`"${key}"`));
  assert.deepEqual(unused, []);
});

test('the static text of index.html is applied by an attribute the code understands', () => {
  const html = readFileSync(join(WEBUI, 'index.html'), 'utf8');
  const attributes = new Set([...html.matchAll(/\bdata-i18n[\w-]*(?==)/g)].map((match) => match[0]));
  assert.deepEqual([...attributes].sort(), ['data-i18n', 'data-i18n-aria-label']);
});
