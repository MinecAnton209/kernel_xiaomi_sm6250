import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { digestToSha256, normalizeSha256, resolveSha256 } from '../../webui/src/logic/checksum.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

test('a SHA-256 is 64 hex digits, written in lower case', () => {
  assert.equal(normalizeSha256(A), A);
  assert.equal(normalizeSha256('A'.repeat(64)), A);
  assert.equal(normalizeSha256(`  ${A}\n`), A);
});

test('anything else is not a SHA-256', () => {
  for (const bad of ['', 'abc', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `${A} ${A}`, `sha256:${A}`]) {
    assert.equal(normalizeSha256(bad), '', JSON.stringify(bad));
  }
  assert.equal(normalizeSha256(undefined), '');
  assert.equal(normalizeSha256(null), '');
});

test('the digest of a GitHub asset is read after its sha256: prefix', () => {
  assert.equal(digestToSha256(`sha256:${A}`), A);
  assert.equal(digestToSha256(`SHA256:${'C'.repeat(64)}`), 'c'.repeat(64));
});

test('a digest of another algorithm, or a broken one, gives nothing', () => {
  for (const bad of [`sha1:${'a'.repeat(40)}`, `sha512:${A}`, 'sha256:', `sha256:${'a'.repeat(10)}`, A, '']) {
    assert.equal(digestToSha256(bad), '', JSON.stringify(bad));
  }
  assert.equal(digestToSha256(null), '');
  assert.equal(digestToSha256(undefined), '');
});

test('GitHub and the manifest agreeing gives that checksum', () => {
  assert.deepEqual(resolveSha256(A, `sha256:${A}`), { sha256: A, conflict: false });
});

test('GitHub alone is enough, and so is the manifest alone', () => {
  assert.deepEqual(resolveSha256('', `sha256:${A}`), { sha256: A, conflict: false });
  assert.deepEqual(resolveSha256(A, undefined), { sha256: A, conflict: false });
  assert.deepEqual(resolveSha256(A, null), { sha256: A, conflict: false });
});

test('no checksum anywhere is not a conflict, just unknown', () => {
  assert.deepEqual(resolveSha256('', undefined), { sha256: '', conflict: false });
  assert.deepEqual(resolveSha256(undefined, null), { sha256: '', conflict: false });
});

test('a manifest checksum and a GitHub digest that differ are a conflict with no checksum to trust', () => {
  assert.deepEqual(resolveSha256(A, `sha256:${B}`), { sha256: '', conflict: true });
});

test('a broken manifest checksum does not block a good GitHub digest', () => {
  assert.deepEqual(resolveSha256('not a sha', `sha256:${A}`), { sha256: A, conflict: false });
});

test('the case of a checksum does not make two equal ones conflict', () => {
  assert.deepEqual(resolveSha256(A.toUpperCase(), `sha256:${A}`), { sha256: A, conflict: false });
});

test('the release loader takes the digest of every asset and refuses a conflict', () => {
  const updates = read('src/pages/updates.ts');
  assert.match(updates, /digest\?: string \| null;/);
  assert.ok(updates.includes('resolveSha256(asset.sha256, release.assets.find'));
  assert.ok(updates.includes("if (conflict) throw new Error(t('updates.checksumConflict'"));
  assert.ok(updates.includes("sha256: resolveSha256('', asset.digest).sha256"), 'a release without a manifest uses the digest too');
});

test('the checksum goes from the download to the flash, quoted', () => {
  const updates = read('src/pages/updates.ts');
  assert.ok(updates.includes('flashKernel(target, asset.sha256)'));
  assert.ok(updates.includes('const checksum = sha256 ? ` ${quote(sha256)}` : \'\';'));
  assert.ok(updates.includes('${quote(FLASH_OUT)}${checksum}'));
  assert.ok(updates.includes('onRetry: () => void flashKernel(zip, sha256)'));
});

test('the dialog says whether the file will be checked', () => {
  const dialog = read('src/ui/flashDialog.ts');
  assert.ok(dialog.includes('checksumKnown'));
  assert.ok(dialog.includes("'flash.confirmChecksum'") && dialog.includes("'flash.confirmNoChecksum'"));
  assert.ok(read('src/pages/updates.ts').includes('sha256 !== \'\''));
});
