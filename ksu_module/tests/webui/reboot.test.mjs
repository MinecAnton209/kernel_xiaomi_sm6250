import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');
const html = read('index.html');
const updates = read('src/pages/updates.ts');
const config = read('src/core/config.ts');
const ksu = read('src/core/ksu.ts');
const dialog = html.match(/<m3e-dialog id="rebootDialog"[\s\S]*?<\/m3e-dialog>/)?.[0] ?? '';

test('the reboot dialog exists and is not an alert, because a reboot is not destructive', () => {
  assert.notEqual(dialog, '', 'no dialog with id rebootDialog');
  assert.match(dialog, /<m3e-dialog id="rebootDialog">/);
});

test('the dialog offers later and reboot, with later focused', () => {
  assert.deepEqual([...dialog.matchAll(/return-value="([^"]+)"/g)].map((match) => match[1]), ['later', 'reboot']);
  assert.match(dialog, /<m3e-button variant="text" autofocus>\s*<m3e-dialog-action return-value="later"/);
  assert.equal((dialog.match(/autofocus/g) ?? []).length, 1);
  assert.ok(dialog.includes('id="rebootDialogBody"'));
});

test('the dialog texts exist in the catalogs through data-i18n', () => {
  for (const key of ['reboot.title', 'reboot.later', 'reboot.now']) {
    assert.ok(dialog.includes(`data-i18n="${key}"`), `${key} is not used by the dialog`);
  }
  const code = read('src/ui/rebootDialog.ts');
  for (const key of ['reboot.bodyModule', 'reboot.bodyKernel']) assert.ok(code.includes(`'${key}'`), `${key} is not used`);
});

test('only the Reboot button says yes; anything else, such as a dismissed dialog, means later', () => {
  const code = read('src/ui/rebootDialog.ts');
  assert.ok(code.includes("showDialog('rebootDialog', 'later')"));
  assert.ok(code.includes("=== 'reboot'"));
});

test('the reboot is the one the KernelSU manager runs', () => {
  assert.ok(config.includes("export const REBOOT_COMMAND = '/system/bin/svc power reboot || /system/bin/reboot';"));
  assert.match(ksu, /export async function rebootPhone\(\): Promise<void> \{\s*await exec\(REBOOT_COMMAND\);/);
});

test('nothing else reboots the phone behind the dialog', () => {
  const sources = ['src/pages/updates.ts', 'src/pages/system.ts', 'src/pages/tune.ts', 'src/pages/uname.ts', 'src/ui/install.ts'];
  for (const file of sources) {
    assert.ok(!/exec\('reboot'\)|exec\(`reboot|svc power reboot/.test(read(file)), `${file} reboots on its own`);
  }
});

test('a module update asks about a reboot after it succeeded, and a later keeps the button', () => {
  const body = updates.slice(updates.indexOf('async function updateModule'), updates.indexOf('let pickerRequest'));
  const success = body.indexOf("showSuccess(t('install.moduleDone')");
  const ask = body.indexOf("askReboot('module')");
  assert.notEqual(success, -1);
  assert.ok(ask > success, 'the question comes after the success is shown');
  assert.ok(body.includes('{ reboot: () => void rebootPhone() }'), 'the panel keeps a Reboot button');
  assert.match(body, /if \(await askReboot\('module'\)\) \{\s*await rebootPhone\(\);\s*return;/);
});

test('a failed module update never asks about a reboot', () => {
  const body = updates.slice(updates.indexOf('async function updateModule'), updates.indexOf('let pickerRequest'));
  const failure = body.indexOf("showError(\n        t('install.installFailed')");
  assert.notEqual(failure, -1);
  assert.ok(body.indexOf("askReboot('module')") > failure, 'the question is only after the success path');
  assert.equal((body.match(/askReboot\(/g) ?? []).length, 1);
});

test('a flashed kernel asks about a reboot, and only a successful flash does', () => {
  const body = updates.slice(updates.indexOf('async function flashKernel'));
  const success = body.indexOf("showSuccess(t('flash.done')");
  const ask = body.indexOf("askReboot('kernel')");
  const failure = body.indexOf("showError(t('flash.failed')");
  assert.ok(success !== -1 && ask > success && ask < failure, 'the question belongs to the success branch');
  assert.equal((body.match(/askReboot\(/g) ?? []).length, 1);
});

test('downloading a kernel without flashing it does not ask about a reboot', () => {
  const body = updates.slice(updates.indexOf('async function downloadKernel'), updates.indexOf('const FLASH_TIMEOUT_MS'));
  assert.ok(!body.includes('askReboot'));
});
