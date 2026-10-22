import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PAGE_REGIONS, REGIONS, placeholderGroups, wrapperClass } from '../../webui/src/logic/skeletonSpecs.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const html = readFileSync(join(SRC, 'index.html'), 'utf8');
const css = readFileSync(join(SRC, 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const main = readFileSync(join(SRC, 'src', 'main.ts'), 'utf8');

/** The markup of one page: from its opening tag to the start of the next page. */
function pageBlock(name) {
  const start = html.indexOf(`<div class="page" data-page="${name}"`);
  assert.notEqual(start, -1, `there is no page named ${name}`);
  const next = html.indexOf('<div class="page"', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

const countOf = (text, needle) => text.split(needle).length - 1;

test('every region is an element that exists exactly once in the markup', () => {
  for (const id of Object.keys(REGIONS)) {
    assert.equal(countOf(html, `id="${id}"`), 1, `#${id} should appear exactly once in index.html`);
  }
});

test('the regions of a page are inside that page', () => {
  for (const [page, ids] of Object.entries(PAGE_REGIONS)) {
    const block = pageBlock(page);
    for (const id of ids) assert.ok(block.includes(`id="${id}"`), `#${id} is not inside the ${page} page`);
  }
});

test('no region is listed for two pages, and the ones that manage themselves are not listed', () => {
  const listed = Object.values(PAGE_REGIONS).flat();
  assert.equal(new Set(listed).size, listed.length, 'a region is listed twice');
  for (const own of ['tuneList', 'updateNotes']) {
    assert.ok(!listed.includes(own), `${own} is shown and hidden by its own code`);
    assert.ok(own in REGIONS, `${own} needs a region`);
  }
  for (const id of listed) assert.ok(id in REGIONS, `${id} has no region`);
});

test('every listed page exists', () => {
  for (const page of Object.keys(PAGE_REGIONS)) pageBlock(page);
});

test('wrapperClass gives each kind the layout of the container it stands in for', () => {
  assert.equal(wrapperClass('chips'), 'chips');
  assert.equal(wrapperClass('items'), 'list');
  assert.equal(wrapperClass('rows'), 'tune-list');
  assert.equal(wrapperClass('lines'), 'ph-lines');
});

test('chips become one group of fixed width chips', () => {
  const groups = placeholderGroups({ kind: 'chips', widths: [100, 80] });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].nodes, [
    { className: 'chip ph', width: '100px' },
    { className: 'chip ph', width: '80px' },
  ]);
  assert.equal(groups[0].className, undefined);
});

test('lines are measured in percent of the row', () => {
  assert.deepEqual(placeholderGroups({ kind: 'lines', widths: [90, 60] })[0].nodes, [
    { className: 'ph-line', width: '90%' },
    { className: 'ph-line', width: '60%' },
  ]);
});

test('items repeat as many times as asked and carry no width', () => {
  const nodes = placeholderGroups({ kind: 'items', count: 3 })[0].nodes;
  assert.equal(nodes.length, 3);
  assert.ok(nodes.every((node) => node.className === 'item ph-item' && node.width === undefined));
});

test('rows are one group each, with a title, a hint and a field', () => {
  const groups = placeholderGroups({ kind: 'rows', count: 4 });
  assert.equal(groups.length, 4);
  for (const group of groups) {
    assert.equal(group.className, 'tune-row');
    assert.deepEqual(group.nodes.map((node) => node.className), ['ph-title', 'ph-hint', 'ph-field']);
  }
});

test('rows vary in width but always the same way, and stay within the row', () => {
  const groups = placeholderGroups({ kind: 'rows', count: 7 });
  const titles = groups.map((group) => group.nodes[0].width);
  assert.ok(new Set(titles).size > 1, 'every title has the same width');
  assert.deepEqual(titles, placeholderGroups({ kind: 'rows', count: 7 }).map((group) => group.nodes[0].width));
  for (const group of groups) {
    for (const node of group.nodes.slice(0, 2)) assert.ok(parseFloat(node.width) > 0 && parseFloat(node.width) <= 100);
  }
});

test('an empty or missing spec draws nothing instead of throwing', () => {
  assert.deepEqual(placeholderGroups({ kind: 'chips' })[0].nodes, []);
  assert.deepEqual(placeholderGroups({ kind: 'lines' })[0].nodes, []);
  assert.deepEqual(placeholderGroups({ kind: 'items' })[0].nodes, []);
  assert.deepEqual(placeholderGroups({ kind: 'rows' }), []);
  assert.deepEqual(placeholderGroups({ kind: 'rows', count: 0 }), []);
  assert.deepEqual(placeholderGroups({ kind: 'rows', count: -2 }), []);
  assert.deepEqual(placeholderGroups({ kind: 'items', count: -1 })[0].nodes, []);
});

test('every region produces something to look at, with sensible sizes', () => {
  for (const [id, spec] of Object.entries(REGIONS)) {
    const groups = placeholderGroups(spec);
    const nodes = groups.flatMap((group) => group.nodes);
    assert.ok(nodes.length > 0, `${id} would show nothing`);
    for (const node of nodes) {
      if (node.width) assert.ok(parseFloat(node.width) > 0, `${id} has a node without a width`);
    }
  }
});

test('every class a placeholder or its wrapper uses is styled', () => {
  const classes = new Set();
  for (const spec of Object.values(REGIONS)) {
    classes.add(wrapperClass(spec.kind));
    for (const group of placeholderGroups(spec)) {
      group.className?.split(/\s+/).forEach((name) => classes.add(name));
      for (const node of group.nodes) node.className.split(/\s+/).forEach((name) => classes.add(name));
    }
  }
  for (const name of classes) {
    assert.ok(new RegExp(`\\.${name}(?![\\w-])`).test(css), `.${name} has no style rule`);
  }
});

test('the skeleton colours come from the page palette, not from the light default of the component', () => {
  const rule = css.match(/m3e-skeleton\s*\{([^}]*)\}/);
  assert.ok(rule, 'there is no rule for m3e-skeleton');
  assert.match(rule[1], /--m3e-skeleton-color:\s*var\(--surface-highest\)/);
  assert.match(rule[1], /--m3e-skeleton-tint-color:/);
});

test('the component is imported, so m3e-skeleton is defined at runtime', () => {
  assert.match(main, /import '@m3e\/web\/skeleton';/);
});

test('the placeholder chip does not replay the entrance animation', () => {
  assert.match(css, /\.chip\.ph\s*\{[^}]*animation:\s*none/);
});
