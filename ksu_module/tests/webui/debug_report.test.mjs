import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const MODULE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEBUI = join(MODULE, 'webui');
const read = (file) => readFileSync(file, 'utf8');

test('the Status tab has the report button, the text area and the copy button', () => {
  const html = read(join(WEBUI, 'index.html'));
  assert.ok(html.includes('id="debugReportBtn"'));
  assert.ok(html.includes('id="debugReportText"'));
  assert.ok(html.includes('id="debugReportCopy"'));
});

test('the report runs debug.sh from the module and is shown in the page', () => {
  const status = read(join(WEBUI, 'src/pages/status.ts'));
  assert.ok(status.includes('exec(`sh ${quote(DEBUG)} 2>&1`)'));
  assert.ok(read(join(WEBUI, 'src/core/config.ts')).includes('export const DEBUG = `${MODULE_DIR}/bin/debug.sh`;'));
  assert.ok(read(join(WEBUI, 'src/main.ts')).includes('initDebugReport();'));
});

test('the report script does not read the serial number or the account, or print installed apps', () => {
  const script = read(join(MODULE, 'kernel_control/bin/debug.sh'));
  assert.equal(script.includes('ro.serialno'), false);
  assert.equal(script.includes('pm list'), false);
  assert.equal(script.includes('ro.boot.serialno'), false);
});

test('the module installs debug.sh as executable', () => {
  assert.ok(read(join(MODULE, 'kernel_control/customize.sh')).includes('set_perm "$MODPATH/bin/debug.sh" 0 0 0755'));
});
