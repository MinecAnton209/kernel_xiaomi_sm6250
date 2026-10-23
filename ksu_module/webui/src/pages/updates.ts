import { FLASH_KERNEL, FLASH_OUT, MODULE_ASSET_RE, MODULE_DIR, MODULE_ZIP, confFile, quote } from '../core/config';
import { byId, busy, type SwitchElement, type Togglable } from '../core/dom';
import { exec, run } from '../core/ksu';
import { toast } from '../core/toast';
import { flashOutcome, lastLogLine, parseFlashPoll } from '../logic/flashStatus';
import { t } from '../logic/i18n';
import { parseProgress } from '../logic/progressMath';
import { confirmFlash } from '../ui/flashDialog';
import {
  closePanel,
  initPanel,
  openPanel,
  setLog,
  setProgress,
  setStep,
  showError,
  showSuccess,
  type Step,
} from '../ui/install';
import { renderMarkdown } from '../ui/markdown';
import { hideSkeleton, showSkeleton } from '../ui/skeleton';

const REPO = 'MinecAnton209/kernel_xiaomi_sm6250';
const CI_BRANCH = '16.0';
const FETCH = `${MODULE_DIR}/bin/fetch.sh`;
const KSUD = '/data/adb/ksud';
const DEFAULT_DIR = '/sdcard/Download';
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

let current: Loaded | null = null;
let fullChangelog: string | null = null;
let showingFull = false;
let pendingKernel: ManifestAsset | null = null;
let pickerDir = DEFAULT_DIR;

// Requests go through curl in the root shell: the WebView enforces CORS, and
// GitHub download URLs redirect to a CDN that does not send CORS headers.
async function getText(url: string): Promise<string> {
  const result = await exec(`curl -fsSL --retry 2 -H 'Accept: application/json' ${quote(url)}`);
  if (result.errno !== 0) {
    throw new Error(result.stderr.trim() || t('updates.githubFailed'));
  }
  return result.stdout;
}

async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T;
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

function renderNotes(): void {
  const notes = byId('updateNotes');
  const source = showingFull ? fullChangelog : current?.changelog ?? null;
  notes.innerHTML = source ? renderMarkdown(source) : '';
  byId('fullChangelogBtn').textContent = showingFull ? t('updates.onlyLatest') : t('updates.fullChangelog');
}

async function toggleFullChangelog(): Promise<void> {
  if (!showingFull && fullChangelog === null) {
    try {
      fullChangelog = await getText(`https://raw.githubusercontent.com/${REPO}/${CI_BRANCH}/CHANGELOG.md`);
    } catch (error) {
      toast(error instanceof Error ? error.message : t('updates.changelogFailed'));
      return;
    }
  }
  showingFull = !showingFull;
  renderNotes();
}

function setChecking(checking: boolean): void {
  byId('checkSpinner').hidden = !checking;
  byId<Togglable>('checkUpdatesBtn').disabled = checking;
  // Notes from an earlier check stay on screen while the next one runs; placeholders only fill the gap on the first.
  if (checking && byId('updateNotes').childElementCount === 0) {
    showSkeleton('updateNotes');
  } else {
    hideSkeleton('updateNotes');
  }
}

function setActions(moduleAvailable: boolean, kernelAvailable: boolean): void {
  byId('moduleUpdateBtn').hidden = !moduleAvailable;
  byId('kernelDownloadBtn').hidden = !kernelAvailable;
  byId('actionsRow').hidden = !moduleAvailable && !kernelAvailable;
}

let checkGeneration = 0;

async function checkUpdates(showErrors: boolean): Promise<void> {
  const channel: Channel = byId<SwitchElement>('channelSwitch').checked ? 'ci' : 'release';
  const generation = ++checkGeneration;
  setChecking(true);
  let loaded: Loaded;
  try {
    loaded = await loadRelease(channel);
  } catch (error) {
    if (showErrors) toast(error instanceof Error ? error.message : t('updates.checkFailed'));
    return;
  } finally {
    setChecking(false);
  }
  // The channel was switched while the request was in flight.
  if (generation !== checkGeneration) return;
  current = loaded;
  showingFull = false;
  renderNotes();
  await run(`printf '%s' ${Date.now()} > ${confFile('last_check')}`);

  const version = await installed();
  const moduleAsset = findAsset(loaded, MODULE_ASSET_RE);
  let moduleUpdate = false;
  if (!moduleAsset) {
    setChip('moduleStatus', t('updates.module.noZip'), 'off');
  } else {
    moduleUpdate = channel === 'ci' ? version.build !== moduleAsset.name : version.version !== loaded.tag;
    const label = version.version || t('updates.module.notInstalled');
    setChip(
      'moduleStatus',
      moduleUpdate
        ? t('updates.module.available', { current: label, tag: loaded.tag })
        : t('updates.module.current', { current: label }),
      moduleUpdate ? 'update' : 'ok',
    );
  }

  const kernelAsset = findAsset(loaded, /^miatoll-default-.*\.zip$/);
  setChip(
    'kernelStatus',
    kernelAsset ? t('updates.kernel.available', { tag: loaded.tag }) : t('updates.kernel.noBuild'),
    kernelAsset ? 'update' : 'off',
  );
  setActions(moduleUpdate, Boolean(kernelAsset));
}

async function autoCheck(): Promise<void> {
  const saved = Number((await exec(`cat ${confFile('last_check')} 2>/dev/null`)).stdout.trim());
  if (Number.isFinite(saved) && Date.now() - saved < AUTO_CHECK_MS) return;
  await checkUpdates(false);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LOCKABLE = ['checkUpdatesBtn', 'moduleUpdateBtn', 'kernelDownloadBtn', 'channelSwitch'] as const;
const STARTUP_GRACE_MS = 10_000;

type TransferResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

let transferring = false;
let cancelRequested = false;

function setLocked(locked: boolean): void {
  transferring = locked;
  for (const id of LOCKABLE) byId<Togglable>(id).disabled = locked;
}

function sidecars(target: string): string {
  return ['state', 'progress', 'log', 'pid'].map((ext) => quote(`${target}.${ext}`)).join(' ');
}

async function cleanupTransfer(target: string, removeTarget: boolean): Promise<void> {
  const extra = removeTarget ? `${quote(target)} ${quote(`${target}.part`)}* ` : '';
  await exec(`rm -f ${extra}${sidecars(target)}`);
}

// Kill the children first: once the script is gone they are reparented to init
// and can no longer be found through its pid.
async function killTransfer(target: string): Promise<void> {
  const pidFile = quote(`${target}.pid`);
  await exec(
    `pid=$(cat ${pidFile} 2>/dev/null); [ -n "$pid" ] && { pkill -P "$pid"; kill "$pid"; pkill -P "$pid"; }; true`,
  );
}

// fetch.sh runs detached so ksu.exec returns at once; progress comes from files.
async function download(asset: ManifestAsset, target: string, steps: readonly Step[]): Promise<TransferResult> {
  const sha = asset.sha256 ? ` ${quote(asset.sha256)}` : '';
  cancelRequested = false;
  await cleanupTransfer(target, true);
  const launch = await exec(
    `( sh ${quote(FETCH)} ${quote(asset.url)} ${quote(target)} ${THREADS}${sha} ) </dev/null >${quote(`${target}.log`)} 2>&1 &`,
  );
  if (launch.errno !== 0) {
    return { ok: false, cancelled: false, message: launch.stderr.trim() || t('download.startFailed') };
  }

  const startedAt = Date.now();
  const deadline = startedAt + DOWNLOAD_TIMEOUT_MS;
  let seenAlive = false;
  let verifying = false;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    if (cancelRequested) {
      await killTransfer(target);
      await cleanupTransfer(target, true);
      return { ok: false, cancelled: true, message: t('download.cancelled') };
    }

    const status = (
      await exec(
        `pid=$(cat ${quote(`${target}.pid`)} 2>/dev/null); alive=0; ` +
          `[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && alive=1; ` +
          `echo "$(cat ${quote(`${target}.state`)} 2>/dev/null)|$(cat ${quote(`${target}.progress`)} 2>/dev/null)|$alive"`,
      )
    ).stdout.trim();
    const [state = '', progress = '', alive = '0'] = status.split('|');
    // While verifying, the bar stays indeterminate instead of jumping back to a full download bar.
    if (state !== 'verifying') setProgress(parseProgress(progress), THREADS);
    if (alive === '1') seenAlive = true;

    if (state === 'verifying' && !verifying) {
      verifying = true;
      setStep('verify', steps);
    }
    if (state === 'done') return { ok: true };
    if (state === 'error') {
      const log = (await exec(`tail -n 3 ${quote(`${target}.log`)} 2>/dev/null`)).stdout.trim();
      return { ok: false, cancelled: false, message: log || t('download.failed') };
    }
    const died = alive !== '1' && (seenAlive || Date.now() - startedAt > STARTUP_GRACE_MS);
    if (died) {
      return { ok: false, cancelled: false, message: t('download.exited') };
    }
  }
  await killTransfer(target);
  return { ok: false, cancelled: false, message: t('download.tooLong') };
}

function lastLines(text: string, count: number): string {
  return text.trim().split('\n').slice(-count).join('\n');
}

function failTransfer(result: Extract<TransferResult, { ok: false }>): void {
  if (result.cancelled) {
    closePanel();
    toast(result.message);
    return;
  }
  showError(t('install.failedHeading'), result.message, '', true);
}

async function updateModule(): Promise<void> {
  const asset = current ? findAsset(current, MODULE_ASSET_RE) : undefined;
  if (!asset || transferring) {
    if (!asset) toast(t('updates.checkFirst'));
    return;
  }
  const steps: readonly Step[] = ['download', 'verify', 'install'];
  setLocked(true);
  openPanel({
    title: t('install.moduleTitle'),
    subtitle: asset.name,
    steps,
    onCancel: () => {
      cancelRequested = true;
    },
    onRetry: () => void updateModule(),
  });

  try {
    const result = await download(asset, MODULE_ZIP, steps);
    if (!result.ok) {
      failTransfer(result);
      return;
    }
    setStep('install', steps);
    const install = await exec(`${quote(KSUD)} module install ${quote(MODULE_ZIP)} 2>&1`);
    await cleanupTransfer(MODULE_ZIP, true);
    if (install.errno !== 0) {
      showError(
        t('install.installFailed'),
        t('install.ksuError'),
        lastLines(install.stdout || install.stderr, 8),
        true,
      );
      return;
    }
    await run(`printf '%s' ${quote(asset.name)} > ${confFile('module_build')}`);
    showSuccess(t('install.moduleDone'), t('install.moduleDoneHint'));
  } finally {
    setLocked(false);
  }
  await checkUpdates(false);
}

let pickerRequest = 0;

function renderPicker(): void {
  byId('pickerPath').textContent = pickerDir;
  const list = byId('pickerList');
  list.replaceChildren();
  const request = ++pickerRequest;
  void exec(`ls -1p ${quote(pickerDir)} 2>/dev/null`).then((result) => {
    if (request !== pickerRequest) return;
    const folders = result.stdout
      .split('\n')
      .filter((name) => name.endsWith('/'))
      .map((name) => name.slice(0, -1))
      .sort((a, b) => a.localeCompare(b));
    if (folders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('picker.noFolders');
      list.append(empty);
      return;
    }
    for (const name of folders) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'item folder';
      item.textContent = name;
      item.addEventListener('click', () => {
        pickerDir = `${pickerDir.replace(/\/$/, '')}/${name}`;
        renderPicker();
      });
      list.append(item);
    }
  });
}

function openPicker(asset: ManifestAsset): void {
  pendingKernel = asset;
  const picker = byId('folderPicker');
  picker.hidden = false;
  picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
  void exec(`cat ${confFile('kernel_dir')} 2>/dev/null`).then((result) => {
    const saved = result.stdout.trim();
    pickerDir = saved || DEFAULT_DIR;
    renderPicker();
  });
}

async function saveKernel(): Promise<void> {
  const asset = pendingKernel;
  if (!asset || transferring) return;
  await run(`printf '%s' ${quote(pickerDir)} > ${confFile('kernel_dir')}`);
  const target = `${pickerDir.replace(/\/$/, '')}/${asset.name}`;
  closePicker();
  await downloadKernel(asset, target);
}

async function downloadKernel(asset: ManifestAsset, target: string): Promise<void> {
  const steps: readonly Step[] = asset.sha256 ? ['download', 'verify'] : ['download'];
  setLocked(true);
  openPanel({
    title: t('install.kernelTitle'),
    subtitle: asset.name,
    steps,
    onCancel: () => {
      cancelRequested = true;
    },
    onRetry: () => void downloadKernel(asset, target),
  });
  try {
    const result = await download(asset, target, steps);
    if (!result.ok) {
      failTransfer(result);
      return;
    }
    await cleanupTransfer(target, false);
    showSuccess(t('install.kernelDone'), t('install.kernelDoneHint', { target }), {
      flash: () => void flashKernel(target),
    });
  } finally {
    setLocked(false);
  }
}

const FLASH_TIMEOUT_MS = 15 * 60 * 1000;

type FlashResult = { ok: true } | { ok: false; message: string; log: string };

/** Starts flash_kernel.sh detached and follows its state file and log until it ends. */
async function runFlash(zip: string): Promise<FlashResult> {
  const file = (ext: string) => quote(`${FLASH_OUT}.${ext}`);
  await exec(`rm -f ${file('state')} ${file('log')} ${file('pid')}`);
  const launch = await exec(`( sh ${quote(FLASH_KERNEL)} ${quote(zip)} ${quote(FLASH_OUT)} ) </dev/null >/dev/null 2>&1 &`);
  if (launch.errno !== 0) {
    return { ok: false, message: launch.stderr.trim() || t('flash.startFailed'), log: '' };
  }

  const poll =
    `pid=$(cat ${file('pid')} 2>/dev/null); alive=0; [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && alive=1; ` +
    `echo "$(cat ${file('state')} 2>/dev/null)|$alive"; tail -n 40 ${file('log')} 2>/dev/null`;
  const startedAt = Date.now();
  let seenAlive = false;
  while (Date.now() - startedAt < FLASH_TIMEOUT_MS) {
    await sleep(POLL_MS);
    const status = parseFlashPoll((await exec(poll)).stdout);
    if (status.alive) seenAlive = true;
    setLog(status.log);
    switch (flashOutcome(status, seenAlive, Date.now() - startedAt)) {
      case 'done':
        return { ok: true };
      case 'error':
        return { ok: false, message: lastLogLine(status.log) || t('flash.failed'), log: status.log };
      case 'died':
        return { ok: false, message: t('flash.exited'), log: status.log };
      case 'running':
        break;
    }
  }
  // The script is left alone: killing an installer halfway through the boot partition is worse than waiting.
  return { ok: false, message: t('flash.tooLong'), log: '' };
}

/** Writes a downloaded kernel zip to the boot partition, after the user confirmed it. */
async function flashKernel(zip: string): Promise<void> {
  if (transferring) return;
  if (!(await confirmFlash(zip.slice(zip.lastIndexOf('/') + 1)))) return;

  const steps: readonly Step[] = ['install'];
  setLocked(true);
  openPanel({
    title: t('flash.title'),
    subtitle: zip.slice(zip.lastIndexOf('/') + 1),
    steps,
    // Stopping the installer halfway could leave a broken boot image, so there is no cancel button.
    onCancel: () => undefined,
    onRetry: () => void flashKernel(zip),
  });
  setStep('install', steps, 'flash.running');
  try {
    const result = await runFlash(zip);
    if (result.ok) {
      showSuccess(t('flash.done'), t('flash.doneHint'), { reboot: () => void exec('reboot') });
    } else {
      showError(t('flash.failed'), result.message, result.log, true);
    }
  } finally {
    setLocked(false);
  }
}

function closePicker(): void {
  byId('folderPicker').hidden = true;
  pendingKernel = null;
}

function pickerUp(): void {
  if (pickerDir === '/') return;
  const parent = pickerDir.replace(/\/+$/, '').replace(/\/[^/]*$/, '');
  pickerDir = parent || '/';
  renderPicker();
}

function kernelButtonClicked(): void {
  const asset = current ? findAsset(current, /^miatoll-default-.*\.zip$/) : undefined;
  if (!asset) {
    toast(t('updates.checkFirst'));
    return;
  }
  openPicker(asset);
}

async function setChannel(ci: boolean): Promise<void> {
  checkGeneration++;
  await run(`printf '%s' ${ci ? 'ci' : 'release'} > ${confFile('update_channel')}`);
  current = null;
  fullChangelog = null;
  showingFull = false;
  renderNotes();
  setActions(false, false);
  setChip('moduleStatus', t('updates.module.idle'), 'off');
  setChip('kernelStatus', t('updates.kernel.idle'), 'off');
}

export function initUpdates(channelSaved: Channel): void {
  const channel = byId<SwitchElement>('channelSwitch');
  channel.checked = channelSaved === 'ci';
  channel.addEventListener('change', (event) => {
    void setChannel((event.target as SwitchElement).checked);
  });

  const checkButton = byId<Togglable>('checkUpdatesBtn');
  checkButton.addEventListener('click', () => void busy(checkButton, () => checkUpdates(true)));

  byId('fullChangelogBtn').addEventListener('click', () => void toggleFullChangelog());

  byId('moduleUpdateBtn').addEventListener('click', () => void updateModule());

  byId('kernelDownloadBtn').addEventListener('click', kernelButtonClicked);
  initPanel();
  byId('pickerUp').addEventListener('click', pickerUp);
  byId('pickerCancel').addEventListener('click', closePicker);
  const select = byId<Togglable>('pickerSelect');
  select.addEventListener('click', () => void busy(select, saveKernel));

  void autoCheck();
}
