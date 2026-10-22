import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createRunner, probeSpawn, spawnCommand } from '../webui/src/spawnExec.ts';

/**
 * Behaves like the manager's WebViewInterface.spawn: it returns at once and later calls
 * `<name>.stdout.emit('data', line)`, `<name>.stderr.emit('data', line)` and `<name>.emit('exit', code)`,
 * followed by `<name>.emit('error', err)` for a non-zero code.
 */
class FakeManager {
  constructor(registry, script = () => ({ stdout: [], stderr: [], code: 0 })) {
    this.registry = registry;
    this.script = script;
    this.calls = [];
    this.silent = false;
    this.throws = false;
    this.late = 0;
  }

  spawn(command, args, options, name) {
    this.calls.push({ command, args, options, name });
    if (this.throws) throw new Error('boom');
    if (this.silent) return;
    const reply = command === 'echo ok' ? { stdout: ['ok'], stderr: [], code: 0 } : this.script(command);
    const target = () => {
      const handle = this.registry[name];
      if (!handle) this.late += 1;
      return handle;
    };
    setImmediate(() => {
      for (const line of reply.stdout) target()?.stdout.emit('data', line);
      for (const line of reply.stderr) target()?.stderr.emit('data', line);
      target()?.emit('exit', reply.code);
      if (reply.code !== 0) {
        setImmediate(() => target()?.emit('error', Object.assign(new Error(reply.stderr.join('\n')), { exitCode: reply.code })));
      }
    });
  }
}

const ok = (stdout = []) => ({ stdout, stderr: [], code: 0 });

test('spawnCommand passes the whole command as the command, with no arguments and empty options', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ok(['x']));
  await spawnCommand(manager, registry, 'cat /a; echo b', 'n1');
  assert.deepEqual(manager.calls, [{ command: 'cat /a; echo b', args: '', options: '{}', name: 'n1' }]);
});

test('spawnCommand returns at once and resolves from the callbacks', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ok(['line']));
  let resolved = false;
  const pending = spawnCommand(manager, registry, 'x', 'n1').then((result) => {
    resolved = true;
    return result;
  });
  assert.equal(resolved, false);
  assert.equal(manager.calls.length, 1);
  assert.equal((await pending).stdout, 'line');
});

test('spawnCommand joins stdout and stderr lines with newlines, as exec does', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ({ stdout: ['a', 'b', 'c'], stderr: ['e1', 'e2'], code: 0 }));
  assert.deepEqual(await spawnCommand(manager, registry, 'x', 'n1'), { errno: 0, stdout: 'a\nb\nc', stderr: 'e1\ne2' });
});

test('spawnCommand keeps empty lines in the output', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ok(['a', '', 'b']));
  assert.equal((await spawnCommand(manager, registry, 'x', 'n1')).stdout, 'a\n\nb');
});

test('spawnCommand reports a non-zero exit code and the error text', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ({ stdout: [], stderr: ['nope'], code: 3 }));
  assert.deepEqual(await spawnCommand(manager, registry, 'x', 'n1'), { errno: 3, stdout: '', stderr: 'nope' });
});

test('spawnCommand resolves once even though the manager emits error after a failed exit', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ({ stdout: [], stderr: ['bad'], code: 1 }));
  const result = await spawnCommand(manager, registry, 'x', 'n1');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.errno, 1);
  assert.equal(manager.late, 0, 'the error event found the callback object already gone');
});

test('spawnCommand removes its callback object after the exit', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const registry = {};
    const manager = new FakeManager(registry, () => ok());
    await spawnCommand(manager, registry, 'x', 'n1');
    assert.ok('n1' in registry, 'still registered for the late error event');
    mock.timers.tick(1000);
    assert.ok(!('n1' in registry));
  } finally {
    mock.timers.reset();
  }
});

test('spawnCommand ignores a second exit and events other than exit', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ok(['a']));
  const result = await spawnCommand(manager, registry, 'x', 'n1');
  registry.n1?.emit('exit', 9);
  registry.n1?.emit('error', new Error('late'));
  registry.n1?.emit('data', 'x');
  assert.equal(result.errno, 0);
});

test('spawnCommand treats a non numeric exit code as a failure', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ({ stdout: [], stderr: [], code: 'oops' }));
  assert.equal((await spawnCommand(manager, registry, 'x', 'n1')).errno, 1);
});

test('spawnCommand rejects and unregisters when spawn throws', async () => {
  const registry = {};
  const manager = new FakeManager(registry);
  manager.throws = true;
  await assert.rejects(spawnCommand(manager, registry, 'x', 'n1'), /boom/);
  assert.ok(!('n1' in registry));
});

test('concurrent commands do not mix their output', async () => {
  const registry = {};
  const manager = new FakeManager(registry, (command) => ok([`out:${command}`]));
  const results = await Promise.all(['one', 'two', 'three'].map((cmd, i) => spawnCommand(manager, registry, cmd, `n${i}`)));
  assert.deepEqual(results.map((r) => r.stdout), ['out:one', 'out:two', 'out:three']);
});

test('probeSpawn accepts a clean ok', async () => {
  assert.equal(await probeSpawn(async () => ({ errno: 0, stdout: 'ok', stderr: '' }), 50), true);
});

test('probeSpawn rejects a wrong answer, a failure, a rejection and silence', async () => {
  assert.equal(await probeSpawn(async () => ({ errno: 0, stdout: 'nope', stderr: '' }), 50), false);
  assert.equal(await probeSpawn(async () => ({ errno: 1, stdout: 'ok', stderr: '' }), 50), false);
  assert.equal(await probeSpawn(() => Promise.reject(new Error('x')), 50), false);
  assert.equal(await probeSpawn(() => new Promise(() => undefined), 20), false);
});

const blockingSpy = () => {
  const calls = [];
  return {
    calls,
    run: async (command) => {
      calls.push(command);
      return { errno: 0, stdout: `blocking:${command}`, stderr: '' };
    },
  };
};

test('without spawn every command goes through the blocking exec', async () => {
  const blocking = blockingSpy();
  const runner = createRunner({ bridge: undefined, registry: {}, blocking: blocking.run });
  assert.equal((await runner.exec('a')).stdout, 'blocking:a');
  assert.equal(await runner.ready(), false);
  assert.deepEqual(blocking.calls, ['a']);
});

test('with a working spawn commands run in the background and the blocking exec is never used', async () => {
  const registry = {};
  const manager = new FakeManager(registry, (command) => ok([`spawned:${command}`]));
  const blocking = blockingSpy();
  const runner = createRunner({ bridge: manager, registry, blocking: blocking.run });
  assert.equal((await runner.exec('a')).stdout, 'spawned:a');
  assert.equal((await runner.exec('b')).stdout, 'spawned:b');
  assert.deepEqual(blocking.calls, []);
});

test('the probe runs once, even for commands started at the same time', async () => {
  const registry = {};
  const manager = new FakeManager(registry, (command) => ok([command]));
  const runner = createRunner({ bridge: manager, registry, blocking: blockingSpy().run });
  await Promise.all([runner.exec('a'), runner.exec('b'), runner.exec('c')]);
  await runner.exec('d');
  assert.equal(manager.calls.filter((call) => call.command === 'echo ok').length, 1);
  assert.deepEqual(manager.calls.map((call) => call.command), ['echo ok', 'a', 'b', 'c', 'd']);
});

test('a spawn that never answers falls back to the blocking exec without sending the real command', async () => {
  const registry = {};
  const manager = new FakeManager(registry);
  manager.silent = true;
  const blocking = blockingSpy();
  const runner = createRunner({ bridge: manager, registry, blocking: blocking.run, probeMs: 20 });
  assert.equal((await runner.exec('real')).stdout, 'blocking:real');
  assert.deepEqual(manager.calls.map((call) => call.command), ['echo ok']);
  assert.deepEqual(blocking.calls, ['real']);
});

test('a spawn that throws falls back to the blocking exec', async () => {
  const registry = {};
  const manager = new FakeManager(registry);
  manager.throws = true;
  const blocking = blockingSpy();
  const runner = createRunner({ bridge: manager, registry, blocking: blocking.run });
  assert.equal((await runner.exec('real')).stdout, 'blocking:real');
});

test('a failed probe is remembered, so later commands do not probe again', async () => {
  const registry = {};
  const manager = new FakeManager(registry);
  manager.silent = true;
  const blocking = blockingSpy();
  const runner = createRunner({ bridge: manager, registry, blocking: blocking.run, probeMs: 20 });
  await runner.exec('a');
  await runner.exec('b');
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(blocking.calls, ['a', 'b']);
});

test('a bridge that appears later is picked up, because "no bridge" is not cached', async () => {
  const registry = {};
  const manager = new FakeManager(registry, (command) => ok([`spawned:${command}`]));
  const blocking = blockingSpy();
  const options = { bridge: undefined, registry, blocking: blocking.run };
  const runner = createRunner(options);
  assert.equal((await runner.exec('a')).stdout, 'blocking:a');
  options.bridge = manager;
  assert.equal((await runner.exec('b')).stdout, 'spawned:b');
});

test('a failing command through spawn still reports its exit code to the caller', async () => {
  const registry = {};
  const manager = new FakeManager(registry, () => ({ stdout: [], stderr: ['denied'], code: 13 }));
  const runner = createRunner({ bridge: manager, registry, blocking: blockingSpy().run });
  assert.deepEqual(await runner.exec('x'), { errno: 13, stdout: '', stderr: 'denied' });
});
