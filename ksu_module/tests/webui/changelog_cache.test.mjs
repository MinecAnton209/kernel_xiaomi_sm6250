import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cachedChangelogOf, parseChangelogCache } from '../../webui/src/logic/changelogCache.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');

test('nothing stored reads as an empty cache', () => {
  assert.deepEqual(parseChangelogCache(null), { releases: {} });
});

test('a corrupt or foreign value reads as an empty cache, so a bad entry never breaks the page', () => {
  for (const raw of ['', '{', 'null', '42', '"text"', '{"other":1}', '{"releases":null}', '{"releases":"x"}']) {
    assert.deepEqual(parseChangelogCache(raw), { releases: {} }, raw);
  }
});

test('a stored release comes back for its own channel only', () => {
  const cache = parseChangelogCache(
    JSON.stringify({ releases: { release: { tag: 'v1.0.0', changelog: '## Added\n- x' } } }),
  );
  assert.equal(cachedChangelogOf(cache, 'release'), '## Added\n- x');
  assert.equal(cachedChangelogOf(cache, 'ci'), null);
});

test('a channel entry without a text changelog is not shown', () => {
  const cache = parseChangelogCache(JSON.stringify({ releases: { ci: { tag: 'unreleased', changelog: 42 } } }));
  assert.equal(cachedChangelogOf(cache, 'ci'), null);
});

test('the full changelog is kept next to the releases', () => {
  const cache = parseChangelogCache(JSON.stringify({ releases: {}, full: '# Changelog' }));
  assert.equal(cache.full, '# Changelog');
});

test('the updates page reads and writes the cache through the shared helpers', () => {
  const page = readFileSync(join(WEBUI, 'src/pages/updates.ts'), 'utf8');
  assert.ok(page.includes("const CHANGELOG_CACHE = 'kernelControl.changelogCache';"));
  assert.ok(page.includes('cachedChangelogOf(readChangelogCache(), channel)'));
  assert.ok(page.includes('writeChangelogCache({ ...cache, releases:'));
  assert.ok(page.includes('(current?.changelog ?? cachedChangelog)'));
});
