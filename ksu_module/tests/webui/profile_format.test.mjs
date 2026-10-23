import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROFILE_NAMES, activeProfile } from '../../webui/src/logic/profileFormat.ts';

test('the profiles are offered in the order the module lists them', () => {
  assert.deepEqual([...PROFILE_NAMES], ['default', 'performance', 'battery']);
});

test('activeProfile reads a profile name the module printed', () => {
  assert.equal(activeProfile('performance\n'), 'performance');
  assert.equal(activeProfile('battery'), 'battery');
});

test('activeProfile ignores surrounding whitespace and line endings', () => {
  assert.equal(activeProfile('  default \r\n'), 'default');
});

test('activeProfile highlights nothing for a name it does not know', () => {
  assert.equal(activeProfile('turbo'), undefined);
  assert.equal(activeProfile('Performance'), undefined);
});

test('activeProfile highlights nothing when the module printed nothing', () => {
  assert.equal(activeProfile(''), undefined);
  assert.equal(activeProfile('   \n'), undefined);
});
