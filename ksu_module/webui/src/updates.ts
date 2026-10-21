import { confFile, quote } from './config';
import { byId, busy, type SwitchElement, type Togglable } from './dom';
import { exec, run } from './ksu';
import { toast } from './toast';

const REPO = 'MinecAnton209/kernel_xiaomi_sm6250';
const MODULE_DIR = '/data/adb/modules/ksu_susfs_ui';
const FETCH = `${MODULE_DIR}/bin/fetch.sh`;
const MODULE_ZIP = '/data/local/tmp/ksu_susfs_ui_update.zip';
const KSUD = '/data/adb/ksud';
const DOWNLOADS = '/sdcard/Download';
const THREADS = 4;
const AUTO_CHECK_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 500;
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;

export type Channel = 'release' | 'ci';

interface GhAsset {
  name: string;
  browser_download_url: string;
}

interface GhRelease {
  tag_name: string;
  body: string | null;
  assets: GhAsset[];
}

interface ManifestAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

interface Manifest {
  tag: string;
  commit: string;
  run: number;
  built_at: string;
  changelog: string;
  assets: ManifestAsset[];
}

interface Loaded {
  tag: string;
  changelog: string;
  assets: ManifestAsset[];
}

interface LinearProgress extends HTMLElement {
  value: number;
  max: number;
}

let current: Loaded | null = null;

// Requests go through curl in the root shell: the WebView enforces CORS, and
// GitHub download URLs redirect to a CDN that does not send CORS headers.
async function getJson<T>(url: string): Promise<T> {
  const result = await exec(`curl -fsSL --retry 2 -H 'Accept: application/json' ${quote(url)}`);
  if (result.errno !== 0) {
    throw new Error(result.stderr.trim() || 'Не удалось загрузить данные с GitHub');
  }
  return JSON.parse(result.stdout) as T;
}

function releasePath(channel: Channel): string {
  return channel === 'ci' ? 'tags/unreleased' : 'latest';
}

async function loadRelease(channel: Channel): Promise<Loaded> {
  const release = await getJson<GhRelease>(`https://api.github.com/repos/${REPO}/releases/${releasePath(channel)}`);
  const manifestAsset = release.assets.find((asset) => asset.name === 'manifest.json');
  if (manifestAsset) {
    const manifest = await getJson<Manifest>(manifestAsset.browser_download_url);
    return { tag: manifest.tag, changelog: manifest.changelog, assets: manifest.assets };
  }
  return {
    tag: release.tag_name,
    changelog: (release.body ?? '').trim(),
    assets: release.assets.map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: 0,
      sha256: '',
    })),
  };
}

async function installed(): Promise<{ version: string; build: string }> {
  const prop = (await exec(`cat ${quote(`${MODULE_DIR}/module.prop`)} 2>/dev/null`)).stdout;
  const version = prop.match(/^version=(.*)$/m)?.[1]?.trim() ?? '';
  const build = (await exec(`cat ${confFile('module_build')} 2>/dev/null`)).stdout.trim();
  return { version, build };
}

export async function loadChannel(): Promise<Channel> {
  const saved = (await exec(`cat ${confFile('update_channel')} 2>/dev/null`)).stdout.trim();
  return saved === 'ci' ? 'ci' : 'release';
}

function findAsset(loaded: Loaded, pattern: RegExp): ManifestAsset | undefined {
  return loaded.assets.find((asset) => pattern.test(asset.name));
}

function setChip(id: string, text: string, state: 'ok' | 'off' | 'update'): void {
  const chip = byId(id);
  chip.textContent = text;
  chip.className = state === 'ok' ? 'chip ok' : state === 'update' ? 'chip' : 'chip off';
}

function renderNotes(loaded: Loaded): void {
  const notes = byId('updateNotes');
  notes.textContent = loaded.changelog ? loaded.changelog.slice(0, 600) : 'Описание не указано';
}

function setChecking(checking: boolean): void {
  byId('checkSpinner').hidden = !checking;
  byId<Togglable>('checkUpdatesBtn').disabled = checking;
}

async function checkUpdates(showErrors: boolean): Promise<void> {
  const channel: Channel = byId<SwitchElement>('channelSwitch').checked ? 'ci' : 'release';
  setChecking(true);
  let loaded: Loaded;
  try {
    loaded = await loadRelease(channel);
  } catch (error) {
    if (showErrors) toast(error instanceof Error ? error.message : 'Не удалось проверить обновления');
    return;
  } finally {
    setChecking(false);
  }
  current = loaded;
  await run(`printf '%s' ${Date.now()} > ${confFile('last_check')}`);

  const version = await installed();
  const moduleAsset = findAsset(loaded, /^ksu_susfs_ui-.*\.zip$/);
  const moduleButton = byId<Togglable>('moduleUpdateBtn');
  if (!moduleAsset) {
    setChip('moduleStatus', 'модуль: в релизе нет zip', 'off');
    moduleButton.disabled = true;
  } else {
    const hasUpdate =
      channel === 'ci' ? version.build !== moduleAsset.name : version.version !== loaded.tag;
    const label = version.version || 'не установлен';
    setChip(
      'moduleStatus',
      hasUpdate ? `модуль: ${label} → ${loaded.tag}` : `модуль: ${label}, актуален`,
      hasUpdate ? 'update' : 'ok',
    );
    moduleButton.disabled = !hasUpdate;
  }

  const kernelAsset = findAsset(loaded, /^miatoll-default-.*\.zip$/);
  byId<Togglable>('kernelDownloadBtn').disabled = !kernelAsset;
  setChip(
    'kernelStatus',
    kernelAsset ? `ядро: ${loaded.tag} доступно` : 'ядро: в релизе нет сборки',
    kernelAsset ? 'update' : 'off',
  );

  renderNotes(loaded);
}

async function autoCheck(): Promise<void> {
  const saved = Number((await exec(`cat ${confFile('last_check')} 2>/dev/null`)).stdout.trim());
  if (Number.isFinite(saved) && Date.now() - saved < AUTO_CHECK_MS) return;
  await checkUpdates(false);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showProgress(done: number, total: number): void {
  const bar = byId<LinearProgress>('downloadProgress');
  bar.value = total > 0 ? done / total : 0;
  bar.max = 1;
}

// fetch.sh runs detached so ksu.exec returns at once; progress comes from files.
async function download(asset: ManifestAsset, target: string): Promise<boolean> {
  const sha = asset.sha256 ? ` ${quote(asset.sha256)}` : '';
  const row = byId('downloadRow');
  row.hidden = false;
  showProgress(0, 0);
  await run(
    `rm -f ${quote(`${target}.state`)} ${quote(`${target}.progress`)}; ` +
      `( sh ${quote(FETCH)} ${quote(asset.url)} ${quote(target)} ${THREADS}${sha} ) </dev/null >${quote(`${target}.log`)} 2>&1 &`,
  );

  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const status = (
        await exec(`cat ${quote(`${target}.state`)} 2>/dev/null; echo '|'; cat ${quote(`${target}.progress`)} 2>/dev/null`)
      ).stdout;
      const [state = '', progress = ''] = status.split('|');
      const [done = '0', total = '0'] = progress.trim().split(/\s+/);
      showProgress(Number(done) || 0, Number(total) || 0);

      if (state.trim() === 'done') return true;
      if (state.trim() === 'error') {
        const log = (await exec(`tail -n 3 ${quote(`${target}.log`)} 2>/dev/null`)).stdout.trim();
        toast(log || 'Загрузка не удалась');
        return false;
      }
    }
    toast('Загрузка заняла слишком много времени');
    return false;
  } finally {
    row.hidden = true;
  }
}

async function updateModule(): Promise<void> {
  const asset = current ? findAsset(current, /^ksu_susfs_ui-.*\.zip$/) : undefined;
  if (!asset) {
    toast('Сначала проверьте обновления');
    return;
  }
  if (!(await download(asset, MODULE_ZIP))) return;
  const installedOk = await run(`${quote(KSUD)} module install ${quote(MODULE_ZIP)}`);
  if (installedOk.errno !== 0) return;
  await run(`printf '%s' ${quote(asset.name)} > ${confFile('module_build')}`);
  toast('Модуль обновлён. Перезагрузите телефон, чтобы применить');
  await checkUpdates(true);
}

async function downloadKernel(): Promise<void> {
  const asset = current ? findAsset(current, /^miatoll-default-.*\.zip$/) : undefined;
  if (!asset) {
    toast('Сначала проверьте обновления');
    return;
  }
  const name = asset.url.split('/').pop() ?? 'miatoll.zip';
  const target = `${DOWNLOADS}/${name}`;
  if (!(await download(asset, target))) return;
  toast(`Ядро сохранено: ${target}. Прошейте его через recovery`);
}

async function setChannel(ci: boolean): Promise<void> {
  await run(`printf '%s' ${ci ? 'ci' : 'release'} > ${confFile('update_channel')}`);
  current = null;
  byId<Togglable>('moduleUpdateBtn').disabled = true;
  byId<Togglable>('kernelDownloadBtn').disabled = true;
  setChip('moduleStatus', 'модуль: проверьте обновления', 'off');
  setChip('kernelStatus', 'ядро: проверьте обновления', 'off');
  byId('updateNotes').textContent = '';
}

export function initUpdates(channelSaved: Channel): void {
  const channel = byId<SwitchElement>('channelSwitch');
  channel.checked = channelSaved === 'ci';
  channel.addEventListener('change', (event) => {
    void setChannel((event.target as SwitchElement).checked);
  });

  const checkButton = byId<Togglable>('checkUpdatesBtn');
  checkButton.addEventListener('click', () => void busy(checkButton, () => checkUpdates(true)));

  const moduleButton = byId<Togglable>('moduleUpdateBtn');
  moduleButton.addEventListener('click', () => void busy(moduleButton, updateModule));

  const kernelButton = byId<Togglable>('kernelDownloadBtn');
  kernelButton.addEventListener('click', () => void busy(kernelButton, downloadKernel));

  void autoCheck();
}
