import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TUNE_DOCS } from '../webui/src/tuneDocs.ts';
import { parseDump, rangeOf } from '../webui/src/tuneDump.ts';

const TUNE_SH = join(dirname(fileURLToPath(import.meta.url)), '..', 'kernel_control', 'bin', 'tune.sh');

test('parseDump reads key, active value and options', () => {
  const states = parseDump('io_scheduler\tdeadline\tnoop deadline cfq\nswappiness\t60\trange 0 100\n');
  assert.deepEqual(states.get('io_scheduler'), { current: 'deadline', options: ['noop', 'deadline', 'cfq'] });
  assert.deepEqual(states.get('swappiness'), { current: '60', options: ['range', '0', '100'] });
});

test('parseDump keeps an unsupported key with empty fields', () => {
  const states = parseDump('tcp_congestion\t\t\n');
  assert.deepEqual(states.get('tcp_congestion'), { current: '', options: [] });
});

test('parseDump tolerates missing columns', () => {
  assert.deepEqual(parseDump('thp\tmadvise').get('thp'), { current: 'madvise', options: [] });
  assert.deepEqual(parseDump('thp').get('thp'), { current: '', options: [] });
});

test('parseDump ignores blank lines and lines without a key', () => {
  const states = parseDump('\n   \n\tvalue\tx\nthp\tnever\talways never\n');
  assert.deepEqual([...states.keys()], ['thp']);
});

test('parseDump handles CRLF line endings and extra spaces', () => {
  const states = parseDump('thp\tmadvise\t always   madvise never \r\n');
  assert.deepEqual(states.get('thp'), { current: 'madvise', options: ['always', 'madvise', 'never'] });
});

test('parseDump of empty output is empty', () => {
  assert.equal(parseDump('').size, 0);
});

test('parseDump keeps the last line when a key repeats', () => {
  assert.equal(parseDump('thp\talways\ta\nthp\tnever\tn\n').get('thp').current, 'never');
});

test('rangeOf reads numeric bounds', () => {
  assert.deepEqual(rangeOf(['range', '0', '100']), { min: 0, max: 100 });
});

test('rangeOf rejects lists, wrong length and non numeric bounds', () => {
  assert.equal(rangeOf(['noop', 'deadline', 'cfq']), undefined);
  assert.equal(rangeOf(['range', '0']), undefined);
  assert.equal(rangeOf(['range', '0', '100', '5']), undefined);
  assert.equal(rangeOf(['range', 'a', '100']), undefined);
  assert.equal(rangeOf(['range', '0', 'z']), undefined);
  assert.equal(rangeOf([]), undefined);
});

test('the help covers exactly the keys tune.sh supports', () => {
  const keys = execFileSync('sh', [TUNE_SH, 'keys'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual([...TUNE_DOCS.map((doc) => doc.key)].sort(), [...keys].sort());
});

test('help keys are unique', () => {
  const keys = TUNE_DOCS.map((doc) => doc.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every help entry is fully written', () => {
  for (const doc of TUNE_DOCS) {
    for (const field of ['title', 'hint', 'about', 'advice']) {
      assert.ok(doc[field].trim().length > 0, `${doc.key}.${field} is empty`);
    }
    assert.ok(Object.keys(doc.values).length > 0, `${doc.key} documents no values`);
    for (const [value, description] of Object.entries(doc.values)) {
      assert.ok(description.trim().length > 0, `${doc.key}.${value} has no description`);
      assert.ok(!/\s/.test(value), `${doc.key}.${value} contains whitespace and could never match an option`);
    }
  }
});
