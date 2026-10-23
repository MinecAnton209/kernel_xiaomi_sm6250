import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildNumberOf,
  describeOffer,
  installedBuild,
  kernelStatus,
  moduleIsCurrent,
  rollingBuildNumber,
} from '../../webui/src/logic/buildInfo.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const updates = readFileSync(join(WEBUI, 'src', 'pages', 'updates.ts'), 'utf8');

test('the build number is the run number in the name of a published file', () => {
  assert.equal(buildNumberOf('kernel_control-48.zip'), 48);
  assert.equal(buildNumberOf('miatoll-default-48.zip'), 48);
  assert.equal(buildNumberOf('miatoll-nethunter-102.zip'), 102);
  assert.equal(buildNumberOf('Image-default-7.gz'), 7);
});

test('a name without a run number has no build number', () => {
  for (const name of ['manifest.json', 'kernel_control.zip', 'kernel_control-v1.1.0.zip', '', 'kernel_control-.zip']) {
    assert.equal(buildNumberOf(name), undefined, name);
  }
});

test('the installed build comes from module.prop first', () => {
  const prop = 'id=kernel_control\nversion=v1.1.0-85e8d5f\nbuild=48\n';
  assert.equal(installedBuild(prop, ''), 48);
  assert.equal(installedBuild(prop, 'kernel_control-40.zip'), 48, 'module.prop wins over the old record');
});

test('without a build line the name recorded by a WebUI update is used', () => {
  assert.equal(installedBuild('version=v1.1.0\n', 'kernel_control-40.zip\n'), 40);
});

test('with neither, the installed build is unknown', () => {
  assert.equal(installedBuild('version=v1.1.0\n', ''), undefined);
  assert.equal(installedBuild('', ''), undefined);
});

test('a build line that is not a number is ignored', () => {
  assert.equal(installedBuild('build=abc\n', ''), undefined);
  assert.equal(installedBuild('build=\n', 'kernel_control-3.zip'), 3);
});

const ci = { channel: 'ci', tag: 'unreleased', assetName: 'kernel_control-48.zip' };

test('a CI module with the offered run number is current', () => {
  assert.equal(moduleIsCurrent({ ...ci, version: 'v1.1.0-85e8d5f', build: 48 }), true);
});

test('a CI module with an older or newer run number is not current', () => {
  assert.equal(moduleIsCurrent({ ...ci, version: 'v1.1.0-85e8d5f', build: 47 }), false);
  assert.equal(moduleIsCurrent({ ...ci, version: 'v1.1.0-85e8d5f', build: 49 }), false);
});

test('a CI module whose build is unknown is offered the update', () => {
  assert.equal(moduleIsCurrent({ ...ci, version: 'v1.1.0', build: undefined }), false);
});

test('an offered file with no run number is never called current on the CI channel', () => {
  assert.equal(moduleIsCurrent({ ...ci, assetName: 'kernel_control.zip', version: 'v1.1.0', build: undefined }), false);
});

test('the CI channel ignores the version string, because it carries a commit, not a build', () => {
  assert.equal(moduleIsCurrent({ ...ci, version: 'anything', build: 48 }), true);
});

test('the release channel compares versions and ignores the build', () => {
  const release = { channel: 'release', tag: 'v1.1.0', assetName: 'kernel_control-v1.1.0.zip' };
  assert.equal(moduleIsCurrent({ ...release, version: 'v1.1.0', build: undefined }), true);
  assert.equal(moduleIsCurrent({ ...release, version: 'v1.1.0', build: 5 }), true);
  assert.equal(moduleIsCurrent({ ...release, version: 'v1.0.0', build: undefined }), false);
  assert.equal(moduleIsCurrent({ ...release, version: 'v1.1.0-85e8d5f', build: 48 }), false, 'a CI build is not the release');
});

test('only the rolling pre-release is shown by its run number', () => {
  assert.equal(rollingBuildNumber('unreleased', 'miatoll-default-48.zip'), 48);
  assert.equal(rollingBuildNumber('Unreleased', 'kernel_control-9.zip'), 9);
  assert.equal(rollingBuildNumber('v1.1.0', 'kernel_control-48.zip'), undefined);
  assert.equal(rollingBuildNumber('unreleased', 'manifest.json'), undefined);
});

test('an offered file is named by its own version when the manifest has one', () => {
  assert.deepEqual(describeOffer('unreleased', 'kernel_control-52.zip', 'v1.1.0-7ae22c4'), {
    kind: 'version',
    text: 'v1.1.0-7ae22c4',
  });
  assert.deepEqual(describeOffer('v1.1.0', 'kernel_control-v1.1.0.zip', 'v1.1.0'), { kind: 'version', text: 'v1.1.0' });
});

test('without a version the rolling pre-release is named by its run number', () => {
  for (const version of [undefined, null, '', '   ']) {
    assert.deepEqual(describeOffer('unreleased', 'kernel_control-52.zip', version), { kind: 'build', number: 52 });
  }
  assert.deepEqual(describeOffer('unreleased', 'miatoll-default-52.zip'), { kind: 'build', number: 52 });
});

test('without a version a tagged release is named by its tag, and so is a file with no run number', () => {
  assert.deepEqual(describeOffer('v1.1.0', 'kernel_control-v1.1.0.zip'), { kind: 'tag', text: 'v1.1.0' });
  assert.deepEqual(describeOffer('unreleased', 'something.zip'), { kind: 'tag', text: 'unreleased' });
});

test('the version is trimmed', () => {
  assert.deepEqual(describeOffer('unreleased', 'kernel_control-52.zip', '  v1.1.0-7ae22c4\n'), {
    kind: 'version',
    text: 'v1.1.0-7ae22c4',
  });
});

test('the manifest asset can carry a version and the page passes it on', () => {
  assert.match(updates, /version\?: string;/);
  assert.ok(updates.includes('describeOffer(tag, asset.name, asset.version)'));
});

test('the chips never show the word unreleased: both go through offeredName', () => {
  assert.ok(updates.includes("t('updates.module.available', { current: label, tag: offeredName(loaded.tag, moduleAsset) })"));
  assert.ok(updates.includes("kernelStatus(running, kernelAsset.version || offeredName(tag, kernelAsset))"));
  assert.ok(updates.includes("t('updates.kernel.available', { tag: status.offered })"));
  assert.ok(!/updates\.(module|kernel)\.available'[^)]*tag: loaded\.tag/.test(updates), 'a chip still shows the raw tag');
});

test('the update check uses the build comparison, not the old name comparison', () => {
  assert.ok(updates.includes('!moduleIsCurrent({'));
  assert.ok(!updates.includes('version.build !== moduleAsset.name'));
});

test('kernelStatus offers the kernel alone when the running one does not report its build', () => {
  assert.deepEqual(kernelStatus(undefined, '1.0.0'), { kind: 'offer', offered: '1.0.0' });
});

test('kernelStatus says the kernel is current when the running build is the offered one', () => {
  assert.deepEqual(kernelStatus('1.0.0', '1.0.0'), { kind: 'current', current: '1.0.0' });
  assert.deepEqual(kernelStatus('1.0.0-3f9a2c1', '1.0.0-3f9a2c1'), { kind: 'current', current: '1.0.0-3f9a2c1' });
});

test('kernelStatus shows the running build against the offer when they differ', () => {
  assert.deepEqual(kernelStatus('1.0.0', '1.0.0-3f9a2c1'), {
    kind: 'update',
    current: '1.0.0',
    offered: '1.0.0-3f9a2c1',
  });
});
