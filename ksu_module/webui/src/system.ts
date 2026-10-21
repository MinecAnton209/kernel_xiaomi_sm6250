import { BIN, confFile, quote } from './config';
import { byId, type SwitchElement } from './dom';
import { exec, run } from './ksu';

export async function loadLog(): Promise<void> {
  const saved = (await exec(`cat ${confFile('log')} 2>/dev/null`)).stdout.trim();
  byId<SwitchElement>('logSwitch').checked = saved !== '0';
}

export async function setLog(on: boolean): Promise<void> {
  await run(`printf '%s' ${on ? 1 : 0} > ${confFile('log')}`);
  await run(`${quote(BIN)} enable_log ${on ? 1 : 0}`, on ? 'Лог включён' : 'Лог выключен');
}

export async function runUmount(): Promise<void> {
  await run(`${quote(BIN)} run_umount`, 'Try umount выполнен');
}
