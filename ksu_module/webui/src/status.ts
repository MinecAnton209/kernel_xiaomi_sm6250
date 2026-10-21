import { BIN, quote } from './config';
import { byId } from './dom';
import { exec } from './ksu';

function renderFeatures(text: string): void {
  const box = byId('features');
  box.replaceChildren();
  for (const line of text.split('\n')) {
    const [key, value] = line.split('=');
    if (!key || value === undefined) continue;
    const chip = document.createElement('span');
    chip.className = value.trim() === '1' ? 'chip ok' : 'chip off';
    chip.textContent = key.replaceAll('_', ' ');
    box.append(chip);
  }
}

export async function loadStatus(): Promise<void> {
  const kernel = await exec('uname -r');
  byId('kernel').textContent = `ядро: ${kernel.stdout.trim()}`;

  const version = (await exec(`${quote(BIN)} show_version`)).stdout.trim();
  const variant = (await exec(`${quote(BIN)} show_variant`)).stdout.trim();
  const susfs = byId('susfs');
  if (version) {
    susfs.textContent = `SUSFS ${version} (${variant})`;
    susfs.className = 'chip ok';
  } else {
    susfs.textContent = 'SUSFS: нет ответа от ядра';
    susfs.className = 'chip off';
  }

  renderFeatures((await exec(`${quote(BIN)} show_features`)).stdout);
}
