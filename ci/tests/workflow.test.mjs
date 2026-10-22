import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WORKFLOW = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows', 'build.yml');
const lines = readFileSync(WORKFLOW, 'utf8').split('\n');

// Job conditions are the quoted `if:` lines at four spaces of indent under a job name.
const conditions = {};
let job = '';
for (const line of lines) {
  const header = line.match(/^  ([a-z]+):$/);
  if (header) job = header[1];
  const condition = line.match(/^    if: "(.*)"$/);
  if (condition && job) conditions[job] = condition[1];
}

const envExpression = (name) => {
  const line = lines.find((candidate) => candidate.startsWith(`      ${name}: `));
  assert.ok(line, `the prerelease job has no ${name} variable`);
  return line.replace(`      ${name}: `, '').replace(/^\$\{\{ /, '').replace(/ \}\}$/, '');
};

// GitHub Actions string functions ignore case, and a missing value counts as an empty string.
const contains = (a, b) => String(a ?? '').toLowerCase().includes(String(b).toLowerCase());
const startsWith = (a, b) => String(a ?? '').toLowerCase().startsWith(String(b).toLowerCase());

function evaluate(expression, context) {
  const js = expression
    .replaceAll('github.event.head_commit.message', 'msg')
    .replaceAll('github.event_name', 'eventName')
    .replaceAll('github.ref', 'ref')
    .replaceAll('needs.build.result', 'buildResult')
    .replaceAll('needs.module.result', 'moduleResult')
    .replaceAll('cancelled()', 'isCancelled');
  const names = ['msg', 'eventName', 'ref', 'buildResult', 'moduleResult', 'isCancelled', 'contains', 'startsWith'];
  const values = [
    context.msg ?? null,
    context.eventName ?? 'push',
    context.ref ?? 'refs/heads/16.0',
    context.build ?? 'success',
    context.module ?? 'success',
    context.cancelled ?? false,
    contains,
    startsWith,
  ];
  return new Function(...names, `return (${js});`)(...values);
}

const BRANCH = 'refs/heads/16.0';
const TAG = 'refs/tags/v1.0.0';
const KERNEL_KEEP = 'miatoll-*|Image-*';
const MODULE_KEEP = 'kernel_control-*';

test('the workflow has the jobs this test reads', () => {
  for (const name of ['build', 'module', 'prerelease']) {
    assert.ok(conditions[name], `no condition for the ${name} job`);
  }
});

const buildCases = [
  ['plain commit', 'feat: add a thing', BRANCH, true, true],
  ['skip kernel', 'fix: x [skip kernel]', BRANCH, false, true],
  ['skip kernel build', 'fix: x [skip kernel build]', BRANCH, false, true],
  ['skip kernel in capitals', 'fix: x [SKIP KERNEL]', BRANCH, false, true],
  ['skip module', 'fix: x [skip module]', BRANCH, true, false],
  ['skip module build', 'fix: x [skip module build]', BRANCH, true, false],
  ['skip module in mixed case', 'fix: x [Skip Module Build]', BRANCH, true, false],
  ['both markers', '[skip kernel] [skip module]', BRANCH, false, false],
  ['skip ci', 'docs: x [skip ci]', BRANCH, false, false],
  ['skip-ci', 'docs: x [skip-ci]', BRANCH, false, false],
  ['ci skip', 'docs: x [ci skip]', BRANCH, false, false],
  ['no ci', 'docs: x [no ci]', BRANCH, false, false],
  ['marker words without brackets', 'we skip kernel work here', BRANCH, true, true],
  ['marker in the body, not the subject', 'feat: x\n\n- notes\n[skip module]', BRANCH, true, false],
  ['tag ignores skip kernel and skip module', '[skip kernel] [skip module]', TAG, true, true],
  ['tag keeps honouring skip ci', 'release [skip ci]', TAG, false, false],
  ['pull request has no commit message', null, 'refs/pull/7/merge', true, true],
  ['another branch follows the same rules', 'wip [skip kernel]', 'refs/heads/feature', false, true],
];

for (const [name, msg, ref, kernel, module] of buildCases) {
  test(`build jobs: ${name}`, () => {
    assert.equal(evaluate(conditions.build, { msg, ref }), kernel, 'kernel build');
    assert.equal(evaluate(conditions.module, { msg, ref }), module, 'module build');
  });
}

// [build result, module result, runs, KEEP, BUILT]
const prereleaseCases = [
  ['both builds succeeded', 'success', 'success', true, '', 'kernel and module'],
  ['kernel skipped', 'skipped', 'success', true, KERNEL_KEEP, 'module only'],
  ['module skipped', 'success', 'skipped', true, MODULE_KEEP, 'kernel only'],
  ['both skipped', 'skipped', 'skipped', false],
  ['kernel failed, module fine', 'failure', 'success', false],
  ['kernel fine, module failed', 'success', 'failure', false],
  ['kernel skipped, module failed', 'skipped', 'failure', false],
  ['kernel failed, module skipped', 'failure', 'skipped', false],
  ['both failed', 'failure', 'failure', false],
  ['kernel cancelled', 'cancelled', 'success', false],
  ['module cancelled', 'success', 'cancelled', false],
];

for (const [name, build, module, runs, keep, built] of prereleaseCases) {
  test(`pre-release: ${name}`, () => {
    assert.equal(evaluate(conditions.prerelease, { build, module }), runs, 'whether it runs');
    if (!runs) return;
    assert.equal(evaluate(envExpression('KEEP'), { build, module }), keep, 'KEEP');
    assert.equal(evaluate(envExpression('BUILT'), { build, module }), built, 'BUILT');
  });
}

test('pre-release does not run when the workflow is cancelled', () => {
  assert.equal(evaluate(conditions.prerelease, { cancelled: true }), false);
});

test('only pushes to 16.0 feed the pre-release', () => {
  assert.equal(evaluate(conditions.prerelease, { ref: 'refs/heads/feature' }), false);
  assert.equal(evaluate(conditions.prerelease, { eventName: 'pull_request', ref: 'refs/pull/7/merge' }), false);
  assert.equal(evaluate(conditions.prerelease, { eventName: 'workflow_dispatch' }), false);
  assert.equal(evaluate(conditions.prerelease, { ref: TAG }), false);
  assert.equal(evaluate(conditions.prerelease, {}), true);
});

test('what is kept never overlaps with what the skipped build would have produced', () => {
  // Kernel assets: miatoll-<variant>-<n>.zip and Image-<variant>-<n>.gz; module: kernel_control-<n>.zip.
  const kernelNames = ['miatoll-default-3.zip', 'miatoll-nethunter-3.zip', 'Image-default-3.gz', 'Image-nethunter-3.gz'];
  const moduleNames = ['kernel_control-3.zip'];
  const matches = (name, keep) => keep.split('|').some((glob) => new RegExp(`^${glob.replace('*', '.*')}$`).test(name));
  for (const name of kernelNames) {
    assert.ok(matches(name, KERNEL_KEEP), `${name} should be kept when the kernel is skipped`);
    assert.ok(!matches(name, MODULE_KEEP), `${name} must not be kept when the module is skipped`);
  }
  for (const name of moduleNames) {
    assert.ok(matches(name, MODULE_KEEP), `${name} should be kept when the module is skipped`);
    assert.ok(!matches(name, KERNEL_KEEP), `${name} must not be kept when the kernel is skipped`);
  }
});
