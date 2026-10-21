import { toast } from './toast';

export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

type Callback = (errno: number, stdout: string, stderr: string) => void;

const callbacks = window as unknown as Record<string, Callback | undefined>;
let nextId = 0;

export function hasBridge(): boolean {
  return typeof ksu !== 'undefined';
}

export function exec(command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const bridge = ksu;
    if (!bridge) {
      reject(new Error('KernelSU bridge is not available'));
      return;
    }
    const name = `cb_${Date.now()}_${nextId++}`;
    callbacks[name] = (errno, stdout, stderr) => {
      delete callbacks[name];
      resolve({ errno, stdout, stderr });
    };
    try {
      bridge.exec(command, '{}', name);
    } catch (error) {
      delete callbacks[name];
      reject(error);
    }
  });
}

export async function run(command: string, okMessage?: string): Promise<ExecResult> {
  const result = await exec(command);
  if (result.errno !== 0) {
    toast(result.stderr.trim() || 'Команда не выполнена');
  } else if (okMessage) {
    toast(okMessage);
  }
  return result;
}
