import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PAGE_REGIONS } from '../../webui/src/logic/skeletonSpecs.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

/** The markup of one tab: from its opening div up to the next tab's opening div. */
function pageMarkup(html, name) {
  const start = html.indexOf(`data-page="${name}"`);
  const end = html.indexOf('<div class="page"', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

test('the battery card is on the Status tab and no longer on the System tab', () => {
  const html = read('index.html');
  assert.ok(pageMarkup(html, 'status').includes('id="batteryInfo"'));
  assert.equal(pageMarkup(html, 'system').includes('id="batteryInfo"'), false);
});

test('the Status tab skeleton covers the battery card, the System tab covers only charging', () => {
  assert.ok(PAGE_REGIONS.status.includes('batteryInfo'));
  assert.deepEqual(PAGE_REGIONS.system, ['chargeInfo']);
});

test('live polling runs while either the Status or the System tab is open', () => {
  const system = read('src/pages/system.ts');
  assert.ok(system.includes("['status', 'system'].map("));
  assert.ok(system.includes('const shown = pages.some((page) => page !== null && !page.hidden);'));
});
