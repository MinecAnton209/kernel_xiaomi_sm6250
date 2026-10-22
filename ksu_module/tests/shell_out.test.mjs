import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { SECTION_MARK, joinCommands, splitSections } from '../webui/src/shellOut.ts';

const run = (commands) => execFileSync('sh', ['-c', joinCommands(commands)], { encoding: 'utf8' });

test('joinCommands puts the marker between commands only', () => {
  assert.equal(joinCommands(['a', 'b']), `a; echo ${SECTION_MARK}; b`);
  assert.equal(joinCommands(['a']), 'a');
  assert.equal(joinCommands([]), '');
});

test('splitSections trims every section', () => {
  assert.deepEqual(splitSections(`  one \n${SECTION_MARK}\n two\n${SECTION_MARK}\nthree\n`), ['one', 'two', 'three']);
});

test('splitSections of empty output is a single empty section', () => {
  assert.deepEqual(splitSections(''), ['']);
});

test('one shell returns each command output in order', () => {
  assert.deepEqual(splitSections(run(['echo first', 'echo second', 'echo third'])), ['first', 'second', 'third']);
});

test('a command with no output leaves an empty section and keeps the order', () => {
  assert.deepEqual(splitSections(run(['echo a', 'true', 'echo c'])), ['a', '', 'c']);
});

test('a failing command does not shift the sections after it', () => {
  assert.deepEqual(splitSections(run(['echo a', 'false', 'echo c'])), ['a', '', 'c']);
});

test('multi line output stays inside its own section', () => {
  const sections = splitSections(run(['printf "x=1\\ny=0\\n"', 'echo done']));
  assert.deepEqual(sections, ['x=1\ny=0', 'done']);
});

test('output that contains spaces and tabs survives', () => {
  assert.deepEqual(splitSections(run(['printf "a b\\tc"', 'echo z'])), ['a b\tc', 'z']);
});

test('destructuring defaults cope with fewer sections than expected', () => {
  const [kernel = '', version = '', variant = ''] = splitSections('5.4.1');
  assert.deepEqual([kernel, version, variant], ['5.4.1', '', '']);
});
