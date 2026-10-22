export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

/** The part of the manager's `ksu` interface that runs a command without blocking the page. */
export interface SpawnBridge {
  spawn(command: string, args: string, options: string | null, callback: string): void;
}

/** Where the manager looks up the callback object by name; `window` in the page. */
export type Registry = Record<string, unknown>;

/** How long the object stays registered after the exit, since the manager emits `error` right after a non-zero exit. */
const CLEANUP_MS = 1000;

/**
 * Runs a command through `ksu.spawn`, which returns at once and reports from a background
 * thread, unlike `ksu.exec`, which holds the page's JS thread until the root shell finishes.
 *
 * The manager calls `<name>.stdout.emit('data', line)`, `<name>.stderr.emit('data', line)` and
 * `<name>.emit('exit', code)`, so an object with that shape is registered under `name`.
 * The whole command goes in as the command with no arguments, which the manager runs as given.
 */
export function spawnCommand(bridge: SpawnBridge, registry: Registry, command: string, name: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const out: string[] = [];
    const err: string[] = [];
    let settled = false;

    registry[name] = {
      stdout: { emit: (_event: string, line: unknown) => void out.push(String(line)) },
      stderr: { emit: (_event: string, line: unknown) => void err.push(String(line)) },
      emit: (event: string, value: unknown) => {
        if (event !== 'exit' || settled) return;
        settled = true;
        const code = Number(value);
        resolve({ errno: Number.isFinite(code) ? code : 1, stdout: out.join('\n'), stderr: err.join('\n') });
        setTimeout(() => {
          delete registry[name];
        }, CLEANUP_MS);
      },
    };

    try {
      bridge.spawn(command, '', '{}', name);
    } catch (error) {
      delete registry[name];
      reject(error);
    }
  });
}

/** True when `run` finishes within `timeoutMs` with a clean `ok`; a hung or broken spawn counts as unusable. */
export function probeSpawn(run: () => Promise<ExecResult>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    run().then(
      (result) => {
        clearTimeout(timer);
        resolve(result.errno === 0 && result.stdout === 'ok');
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

export interface RunnerOptions {
  /** Undefined when the manager has no `spawn`. */
  bridge: SpawnBridge | undefined;
  registry: Registry;
  /** The blocking fallback, `ksu.exec`. */
  blocking: (command: string) => Promise<ExecResult>;
  probeMs?: number;
}

/**
 * Picks `spawn` when the manager provides it and it answers a harmless probe, and the blocking
 * `exec` otherwise. The probe runs once, before the first real command, so a manager whose
 * protocol differs can never leave a real command waiting for a reply that does not come.
 */
export function createRunner(options: RunnerOptions): { exec(command: string): Promise<ExecResult>; ready(): Promise<boolean> } {
  const { registry, blocking, probeMs = 5000 } = options;
  let counter = 0;
  let usable: Promise<boolean> | undefined;

  const viaSpawn = (command: string): Promise<ExecResult> => {
    const bridge = options.bridge;
    if (!bridge) return blocking(command);
    counter += 1;
    return spawnCommand(bridge, registry, command, `kc_spawn_${counter}`);
  };

  const ready = (): Promise<boolean> => {
    if (!options.bridge) return Promise.resolve(false);
    usable ??= probeSpawn(() => viaSpawn('echo ok'), probeMs);
    return usable;
  };

  return {
    ready,
    async exec(command) {
      return (await ready()) ? viaSpawn(command) : blocking(command);
    },
  };
}
