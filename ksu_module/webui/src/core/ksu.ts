import { t } from '../logic/i18n';
import { createRunner, type ExecResult, type Registry, type SpawnBridge } from './spawnExec';
import { toast } from './toast';

export type { ExecResult } from './spawnExec';

type Callback = (errno: number, stdout: string, stderr: string) => void;

const registry = window as unknown as Record<string, Callback | undefined> & Registry;
let nextId = 0;

export function hasBridge(): boolean {
  return typeof ksu !== 'undefined';
}

/** `ksu.exec`: works on every manager, but holds the page's JS thread until the root shell ends. */
function blockingExec(command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const bridge = ksu;
    if (!bridge) {
      reject(new Error('KernelSU bridge is not available'));
      return;
    }
    const name = `cb_${Date.now()}_${nextId++}`;
    registry[name] = (errno, stdout, stderr) => {
      delete registry[name];
      resolve({ errno, stdout, stderr });
    };
    try {
      bridge.exec(command, '{}', name);
    } catch (error) {
      delete registry[name];
      reject(error);
    }
  });
}

function spawnBridge(): SpawnBridge | undefined {
  const bridge = typeof ksu === 'undefined' ? undefined : ksu;
  return bridge && typeof bridge.spawn === 'function' ? (bridge as SpawnBridge) : undefined;
}

const runner = createRunner({
  // The bridge is looked up per call: it is injected by the manager, not by this page.
  get bridge() {
    return spawnBridge();
  },
  registry,
  blocking: blockingExec,
});

/** Runs a command in a root shell in the background; the page stays responsive meanwhile. */
export function exec(command: string): Promise<ExecResult> {
  return runner.exec(command);
}

/** Starts the check that decides between `spawn` and `exec`, so the first real command does not wait for it. */
export function warmUp(): void {
  void runner.ready();
}

export async function run(command: string, okMessage?: string): Promise<ExecResult> {
  const result = await exec(command);
  if (result.errno !== 0) {
    toast(result.stderr.trim() || t('common.commandFailed'));
  } else if (okMessage) {
    toast(okMessage);
  }
  return result;
}
