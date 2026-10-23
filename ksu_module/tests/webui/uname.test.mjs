import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CUSTOM_PRESET,
  MAX_APPS,
  UNAME_PRESETS,
  isPackageName,
  matchPreset,
  parseMissing,
  parsePackages,
  parseUname,
  validatePackage,
  validateText,
} from '../../webui/src/logic/uname.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

test('parseUname reads every field and the list of apps', () => {
  const state = parseUname(
    [
      'real=4.14.336-real',
      'supported=1',
      'enabled=1',
      'release=4.14.190-perf-g3f6a1c0b8d25',
      'version=#1 SMP PREEMPT Fri Jan 15 03:12:44 CST 2021',
      'scope=selected',
      'app=com.bank.app',
      'app=com.game.big',
    ].join('\n'),
  );
  assert.deepEqual(state, {
    real: '4.14.336-real',
    supported: true,
    enabled: true,
    release: '4.14.190-perf-g3f6a1c0b8d25',
    version: '#1 SMP PREEMPT Fri Jan 15 03:12:44 CST 2021',
    scope: 'selected',
    apps: ['com.bank.app', 'com.game.big'],
  });
});

test('parseUname on a fresh install is off, for every app, and not empty-handed', () => {
  const state = parseUname('real=4.14.336\nsupported=1\nenabled=\nrelease=\nversion=\nscope=\n');
  assert.equal(state.enabled, false);
  assert.equal(state.scope, 'apps');
  assert.deepEqual(state.apps, []);
  assert.equal(state.release, '');
});

test('parseUname marks an old kernel as unsupported', () => {
  assert.equal(parseUname('supported=0').supported, false);
  assert.equal(parseUname('').supported, false);
});

test('parseUname keeps an equals sign inside a value', () => {
  assert.equal(parseUname('version=#1 a=b').version, '#1 a=b');
});

test('parseUname survives carriage returns, blank lines and noise', () => {
  const state = parseUname('real=4.14\r\n\r\nnonsense\r\nenabled=1\r\napp=com.a.b\r\napp=\r\n');
  assert.equal(state.real, '4.14');
  assert.equal(state.enabled, true);
  assert.deepEqual(state.apps, ['com.a.b']);
});

test('an unknown scope is read as every app', () => {
  assert.equal(parseUname('scope=everyone').scope, 'apps');
});

test('parseMissing lists only the missing lines', () => {
  assert.deepEqual(parseMissing('missing=com.a.b\nok\nmissing=com.c.d\nmissing=\n'), ['com.a.b', 'com.c.d']);
  assert.deepEqual(parseMissing(''), []);
});

test('parsePackages keeps package names and drops everything else', () => {
  assert.deepEqual(parsePackages('com.b.app\n\n  com.a.app  \nnot a name\nWARNING: x\n'), ['com.b.app', 'com.a.app']);
});

test('package names must be dotted and start with a letter', () => {
  for (const name of ['com.example.app', 'a.b', 'com.Example_1.app2']) assert.equal(isPackageName(name), true, name);
  for (const name of ['', 'game', '1com.app', 'com..app', 'com.app.', 'com.a b', 'com.a;reboot', 'com.app\n']) {
    assert.equal(isPackageName(name), false, JSON.stringify(name));
  }
});

test('a package can be added once, up to the limit', () => {
  assert.equal(validatePackage('com.a.b', []), undefined);
  assert.equal(validatePackage('com.a.b', ['com.a.b']), 'uname.duplicate');
  assert.equal(validatePackage('nope', []), 'uname.invalidPackage');
  const full = Array.from({ length: MAX_APPS }, (_, index) => `com.app${index}.x`);
  assert.equal(validatePackage('com.new.app', full), 'uname.tooMany');
  assert.equal(validatePackage('com.new.app', full.slice(1)), undefined);
});

test('the version text follows the rules of the shell script', () => {
  assert.equal(validateText('4.14.190-perf-g3f6a1c0b8d25'), undefined);
  assert.equal(validateText('#1 SMP PREEMPT Fri Jan 15 03:12:44 CST 2021'), undefined);
  assert.equal(validateText('a'.repeat(64)), undefined);
  for (const bad of ['', 'a'.repeat(65), 'default', '4.14-ядро', 'a\nb', 'tab\there']) {
    assert.equal(validateText(bad), 'uname.invalidText', JSON.stringify(bad));
  }
});

test('every ready-made option is valid and has a unique id and strings', () => {
  assert.ok(UNAME_PRESETS.length >= 3);
  const ids = UNAME_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(CUSTOM_PRESET));
  const pairs = UNAME_PRESETS.map((preset) => `${preset.release}|${preset.version}`);
  assert.equal(new Set(pairs).size, pairs.length, 'two options are the same');
  for (const preset of UNAME_PRESETS) {
    assert.equal(validateText(preset.release), undefined, `${preset.id} release`);
    assert.equal(validateText(preset.version), undefined, `${preset.id} version`);
    assert.match(preset.release, /^4\.14\.\d+/, `${preset.id} should look like a 4.14 kernel`);
    assert.match(preset.version, /^#\d+ SMP PREEMPT /, `${preset.id} should look like a kernel build string`);
  }
});

test('matchPreset finds an option by both strings, and anything else is custom', () => {
  for (const preset of UNAME_PRESETS) assert.equal(matchPreset(preset.release, preset.version), preset.id);
  const first = UNAME_PRESETS[0];
  assert.equal(matchPreset(first.release, 'something else'), CUSTOM_PRESET);
  assert.equal(matchPreset('something else', first.version), CUSTOM_PRESET);
  assert.equal(matchPreset('', ''), CUSTOM_PRESET);
});

test('the SU tab has the form, with every control the page code looks up', () => {
  const html = read('index.html');
  for (const id of [
    'unameSwitch', 'unamePreset', 'unameRelease', 'unameVersion', 'unameScope', 'unameAppsBlock',
    'unameAppInput', 'unameAddApp', 'unameApps', 'unamePackages', 'unameApply', 'unameReal', 'unameUnsupported',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from index.html`);
  }
  assert.match(html, /id="unameAppsBlock" hidden/, 'the app list starts hidden');
  assert.match(html, /<m3e-option value="apps"/);
  assert.match(html, /<m3e-option value="selected"/);
});

test('the page builds the preset options from the list and applies through uname.sh set', () => {
  const page = read('src/pages/uname.ts');
  assert.ok(page.includes('UNAME_PRESETS.map'));
  assert.ok(page.includes("'set',"));
  assert.ok(page.includes('...selectedApps.map(quote)'), 'package names must be quoted');
  assert.ok(page.includes('quote(release)') && page.includes('quote(version)'), 'the strings must be quoted');
});

test('typed edits are not overwritten when the tab reloads', () => {
  const page = read('src/pages/uname.ts');
  assert.ok(page.includes('if (!dirty) fillForm(state);'));
});

test('the SU tab loads the form together with sus_su', () => {
  assert.match(read('src/nav.ts'), /su: \(\) => Promise\.all\(\[loadSusSu\(\), loadUname\(\)\]\)/);
  assert.ok(read('src/main.ts').includes('initUname();'));
});
