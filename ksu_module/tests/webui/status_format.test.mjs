import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLabel, buildVersion, featureSpecs } from '../../webui/src/logic/statusFormat.ts';

test('featureSpecs makes one chip per feature line', () => {
  assert.deepEqual(featureSpecs('sus_path=1\nsus_mount=0'), [
    { key: 'sus_path', text: 'sus path', state: 'ok' },
    { key: 'sus_mount', text: 'sus mount', state: 'off' },
  ]);
});

test('featureSpecs keeps the raw name as the key so a refresh updates chips in place', () => {
  const before = featureSpecs('open_redirect=0');
  const after = featureSpecs('open_redirect=1');
  assert.equal(before[0].key, after[0].key);
  assert.equal(before[0].state, 'off');
  assert.equal(after[0].state, 'ok');
});

test('featureSpecs treats anything but 1 as off', () => {
  assert.equal(featureSpecs('a=2')[0].state, 'off');
  assert.equal(featureSpecs('a=')[0].state, 'off');
  assert.equal(featureSpecs('a= 1 ')[0].state, 'ok');
});

test('featureSpecs skips blank lines, lines without a name and lines without a value', () => {
  assert.deepEqual(featureSpecs('\n=1\nnovalue\nok=1\n'), [{ key: 'ok', text: 'ok', state: 'ok' }]);
});

test('featureSpecs replaces every underscore in the label', () => {
  assert.equal(featureSpecs('auto_add_sus_bind_mount=1')[0].text, 'auto add sus bind mount');
});

test('featureSpecs of empty output is empty', () => {
  assert.deepEqual(featureSpecs(''), []);
});

test('buildLabel joins the kernel version and commit', () => {
  assert.equal(buildLabel('build_version=1.0.0\nbuild_commit=3f9a2c1\n'), '1.0.0 (3f9a2c1)');
});

test('buildLabel leaves out the commit when the kernel was built outside git', () => {
  assert.equal(buildLabel('build_version=1.0.0\nbuild_commit=unknown\n'), '1.0.0');
  assert.equal(buildLabel('build_version=1.0.0\n'), '1.0.0');
});

test('buildLabel is undefined when the kernel does not report a build, as on an older kernel', () => {
  assert.equal(buildLabel(''), undefined);
  assert.equal(buildLabel('build_version=\n'), undefined);
  assert.equal(buildLabel('sus_path=1\n'), undefined);
});

test('buildLabel ignores a build_version that only appears inside another line', () => {
  assert.equal(buildLabel('old_build_version=9\nbuild_version=1.0.0'), '1.0.0');
});

test('buildVersion is the version without the commit', () => {
  assert.equal(buildVersion('build_version=1.0.0-3f9a2c1\nbuild_commit=3f9a2c1\n'), '1.0.0-3f9a2c1');
  assert.equal(buildVersion('build_version=1.0.0\n'), '1.0.0');
});

test('buildVersion is undefined when the kernel does not report one', () => {
  assert.equal(buildVersion(''), undefined);
  assert.equal(buildVersion('build_version=\n'), undefined);
});
