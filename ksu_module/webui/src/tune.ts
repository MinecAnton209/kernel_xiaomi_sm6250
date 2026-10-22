import { TUNE, quote } from './config';
import { byId } from './dom';
import { exec, run } from './ksu';

interface Tunable {
  key: string;
  title: string;
  hint: string;
}

type Control = HTMLSelectElement | HTMLInputElement;

const TUNABLES: readonly Tunable[] = [
  { key: 'io_scheduler', title: 'Планировщик ввода-вывода', hint: 'Применяется ко всем дискам sd*.' },
  { key: 'cpu_governor_little', title: 'Governor CPU: малые ядра', hint: 'Кластер policy0.' },
  { key: 'cpu_governor_big', title: 'Governor CPU: большие ядра', hint: 'Кластер policy6.' },
  { key: 'gpu_governor', title: 'Governor GPU', hint: 'Adreno, kgsl devfreq.' },
  { key: 'tcp_congestion', title: 'Управление перегрузкой TCP', hint: 'bbr обычно лучше на нестабильном Wi-Fi.' },
  { key: 'thp', title: 'Transparent Huge Pages', hint: 'madvise включает их только по запросу приложения.' },
  { key: 'swappiness', title: 'Swappiness', hint: 'Чем выше, тем охотнее система уходит в zram.' },
];

async function query(key: string, action: 'get' | 'options'): Promise<string[]> {
  const { stdout } = await exec(`${quote(TUNE)} ${action} ${key}`);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function buildControl(options: string[], current: string): Control {
  const range = options[0]?.match(/^range (\d+) (\d+)$/);
  if (range) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'field';
    input.min = range[1] ?? '0';
    input.max = range[2] ?? '100';
    input.value = current;
    return input;
  }

  const select = document.createElement('select');
  select.className = 'field';
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    select.append(item);
  }
  select.value = current;
  return select;
}

async function apply(tunable: Tunable, control: Control): Promise<void> {
  control.disabled = true;
  try {
    const result = await run(
      `${quote(TUNE)} set ${tunable.key} ${quote(control.value)}`,
      `${tunable.title}: ${control.value}`,
    );
    if (result.errno !== 0) {
      const [current = ''] = await query(tunable.key, 'get');
      control.value = current;
    }
  } finally {
    control.disabled = false;
  }
}

async function renderRow(tunable: Tunable): Promise<HTMLElement> {
  const row = document.createElement('div');
  row.className = 'tune-row';

  const title = document.createElement('strong');
  title.textContent = tunable.title;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = tunable.hint;
  row.append(title, hint);

  const [options, [current = '']] = await Promise.all([query(tunable.key, 'options'), query(tunable.key, 'get')]);
  if (options.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip off';
    chip.textContent = 'ядро не поддерживает';
    row.append(chip);
    return row;
  }

  const control = buildControl(options, current);
  control.addEventListener('change', () => void apply(tunable, control));
  row.append(control);
  return row;
}

export async function loadTune(): Promise<void> {
  const rows = await Promise.all(TUNABLES.map(renderRow));
  byId('tuneList').replaceChildren(...rows);
}
