import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { STARTUP_GRACE_MS, flashOutcome, lastLogLine, parseFlashPoll } from '../../webui/src/logic/flashStatus.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

test('a poll is the state and liveness on the first line, then the log', () => {
  assert.deepEqual(parseFlashPoll('running|1\nChecking device...\nFlashing the image'), {
    state: 'running',
    alive: true,
    log: 'Checking device...\nFlashing the image',
  });
});

test('a poll with no log yet still has a state', () => {
  assert.deepEqual(parseFlashPoll('running|1\n'), { state: 'running', alive: true, log: '' });
});

test('a poll before the script wrote anything is not started', () => {
  assert.deepEqual(parseFlashPoll('|0\n'), { state: '', alive: false, log: '' });
  assert.deepEqual(parseFlashPoll(''), { state: '', alive: false, log: '' });
});

test('an unknown state is read as not started', () => {
  assert.equal(parseFlashPoll('rebooting|1\n').state, '');
});

test('carriage returns and trailing blank lines are dropped from the log', () => {
  assert.equal(parseFlashPoll('done|0\r\nAll good\r\n\r\n\r\n').log, 'All good');
});

test('blank lines inside the log are kept', () => {
  assert.equal(parseFlashPoll('running|1\na\n\nb\n').log, 'a\n\nb');
});

test('done and error win over a script that already exited', () => {
  assert.equal(flashOutcome({ state: 'done', alive: false, log: '' }, true, 1000), 'done');
  assert.equal(flashOutcome({ state: 'error', alive: false, log: '' }, true, 1000), 'error');
  assert.equal(flashOutcome({ state: 'done', alive: true, log: '' }, false, 0), 'done');
});

test('a running script keeps running', () => {
  assert.equal(flashOutcome({ state: 'running', alive: true, log: '' }, true, 5000), 'running');
});

test('a script that has not started yet gets a grace period', () => {
  const poll = { state: '', alive: false, log: '' };
  assert.equal(flashOutcome(poll, false, 0), 'running');
  assert.equal(flashOutcome(poll, false, STARTUP_GRACE_MS), 'running');
  assert.equal(flashOutcome(poll, false, STARTUP_GRACE_MS + 1), 'died');
});

test('a script that was seen alive and is gone while still running has died', () => {
  assert.equal(flashOutcome({ state: 'running', alive: false, log: '' }, true, 1000), 'died');
});

test('the last line of the log is the last one with text', () => {
  assert.equal(lastLogLine('one\ntwo\n\n  \n'), 'two');
  assert.equal(lastLogLine('  spaced  '), 'spaced');
  assert.equal(lastLogLine(''), '');
});

const html = read('index.html');
const updates = read('src/pages/updates.ts');
const dialog = html.match(/<m3e-dialog id="flashDialog"[\s\S]*?<\/m3e-dialog>/)?.[0] ?? '';

test('the flash dialog exists, with cancel focused and flash as the only way to agree', () => {
  assert.notEqual(dialog, '', 'no dialog with id flashDialog');
  assert.deepEqual([...dialog.matchAll(/return-value="([^"]+)"/g)].map((match) => match[1]), ['cancel', 'flash']);
  assert.match(dialog, /<m3e-button variant="text" autofocus>\s*<m3e-dialog-action return-value="cancel"/);
  assert.equal((dialog.match(/autofocus/g) ?? []).length, 1);
  assert.ok(dialog.includes('id="flashDialogBody"'));
});

test('the panel has the flash and reboot buttons, hidden until needed', () => {
  assert.match(html, /id="installFlash"[^>]*\bhidden\b/);
  assert.match(html, /id="installReboot"[^>]*\bhidden\b/);
});

test('flashing asks first and does nothing when the answer is no', () => {
  const body = updates.slice(updates.indexOf('async function flashKernel'));
  const ask = body.indexOf('confirmFlash(');
  assert.notEqual(ask, -1);
  assert.match(body, /if \(!\(await confirmFlash\(.*\)\)\) return;/);
  assert.ok(ask < body.indexOf('openPanel('), 'the panel must not open before the answer');
  assert.ok(ask < body.indexOf('runFlash('), 'nothing may run before the answer');
});

test('the kernel download offers flashing, and only a finished flash offers a reboot', () => {
  assert.match(updates, /showSuccess\(t\('install\.kernelDone'\)[\s\S]*?flash: \(\) => void flashKernel\(target, asset\.sha256\)/);
  assert.match(updates, /showSuccess\(t\('flash\.done'\)[\s\S]*?reboot:/);
});

test('a flash cannot be cancelled, because a half written boot image would not boot', () => {
  const body = updates.slice(updates.indexOf('async function flashKernel'));
  assert.ok(body.includes("setStep('install', steps, 'flash.running')"), 'the install step hides the cancel button');
  assert.ok(body.includes('onCancel: () => undefined'));
});

test('the other buttons are locked while a flash runs, and a run that is still going is never killed', () => {
  const body = updates.slice(updates.indexOf('async function flashKernel'));
  assert.ok(body.includes('setLocked(true)') && body.includes('setLocked(false)'));
  assert.ok(body.includes('if (transferring) return;'));
  const run = updates
    .slice(updates.indexOf('async function runFlash'), updates.indexOf('async function flashKernel'))
    .replace(/^\s*\/\/.*$/gm, '');
  // `kill -0` only asks whether the script is alive; any other signal would stop the installer.
  assert.ok(!/killTransfer|pkill|kill -[1-9A-Za-z]/.test(run), 'the flash script must never be killed from the page');
  assert.ok(run.includes('kill -0'), 'liveness is checked with signal 0');
});

test('the script is started detached and its zip and output prefix are quoted', () => {
  assert.ok(updates.includes('quote(FLASH_KERNEL)} ${quote(zip)} ${quote(FLASH_OUT)}'));
  assert.ok(updates.includes('</dev/null >/dev/null 2>&1 &'));
});

test('the module installs the script with the right permissions', () => {
  assert.ok(read('../kernel_control/customize.sh').includes('set_perm "$MODPATH/bin/flash_kernel.sh" 0 0 0755'));
});
