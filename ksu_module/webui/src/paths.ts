import { BIN, PATH_RE, confFile, quote } from './config';
import { byId } from './dom';
import { exec, run } from './ksu';
import { toast } from './toast';

async function readPaths(): Promise<string[]> {
  const result = await exec(`cat ${confFile('paths.txt')} 2>/dev/null`);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function writePaths(list: string[]): Promise<void> {
  const args = list.map(quote).join(' ');
  await run(`printf '%s\\n' ${args} > ${confFile('paths.txt')}`);
}

function renderPaths(list: string[]): void {
  const box = byId('pathList');
  box.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Список пуст';
    box.append(empty);
    return;
  }
  for (const path of list) {
    const item = document.createElement('div');
    item.className = 'item';
    const code = document.createElement('code');
    code.textContent = path;
    const remove = document.createElement('m3e-button');
    remove.setAttribute('variant', 'text');
    remove.textContent = 'Убрать';
    remove.addEventListener('click', () => {
      void removePath(path);
    });
    item.append(code, remove);
    box.append(item);
  }
}

export async function refreshPaths(): Promise<void> {
  renderPaths(await readPaths());
}

export async function addPath(): Promise<void> {
  const input = byId<HTMLInputElement>('pathInput');
  const path = input.value.trim();
  if (!PATH_RE.test(path)) {
    toast('Путь должен начинаться с / и содержать только латиницу, цифры, . _ - /');
    return;
  }
  const list = await readPaths();
  if (list.includes(path)) {
    toast('Этот путь уже в списке');
    return;
  }
  const exists = await exec(`[ -e ${quote(path)} ] && echo yes`);
  if (!exists.stdout.includes('yes')) {
    toast('Файла или папки по этому пути нет');
    return;
  }
  list.push(path);
  await writePaths(list);
  const applied = await run(`${quote(BIN)} add_sus_path ${quote(path)}`);
  if (applied.errno !== 0) return;
  input.value = '';
  renderPaths(list);
  toast('Путь добавлен');
}

export async function removePath(path: string): Promise<void> {
  const list = (await readPaths()).filter((item) => item !== path);
  await writePaths(list);
  renderPaths(list);
  toast('Убрано из списка. В ядре путь скрыт до перезагрузки');
}

export async function applyAll(): Promise<void> {
  const list = await readPaths();
  if (list.length === 0) {
    toast('Список пуст');
    return;
  }
  let failed = 0;
  for (const path of list) {
    const result = await exec(`${quote(BIN)} add_sus_path ${quote(path)}`);
    if (result.errno !== 0) failed += 1;
  }
  toast(failed ? `Не применено путей: ${failed}` : 'Пути применены');
}
