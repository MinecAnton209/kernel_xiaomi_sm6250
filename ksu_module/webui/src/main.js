import '@m3e/web/button';
import '@m3e/web/switch';
import './style.css';

const CONF = '/data/adb/susfs_ui';
const BIN = '/data/adb/modules/ksu_susfs_ui/bin/ksu_susfs';
const PATH_RE = /^\/[A-Za-z0-9._/-]{1,255}$/;

const $ = (id) => document.getElementById(id);
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

function exec(cmd) {
  return new Promise((resolve, reject) => {
    const name = `cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window[name] = (errno, stdout, stderr) => {
      delete window[name];
      resolve({ errno, stdout, stderr });
    };
    try {
      ksu.exec(cmd, '{}', name);
    } catch (e) {
      delete window[name];
      reject(e);
    }
  });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function readPaths() {
  const r = await exec(`cat ${q(`${CONF}/paths.txt`)} 2>/dev/null`);
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function writePaths(list) {
  const args = list.map(q).join(' ');
  await exec(`printf '%s\\n' ${args} > ${q(`${CONF}/paths.txt`)}`);
}

function renderPaths(list) {
  const box = $('pathList');
  box.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Список пуст';
    box.append(empty);
    return;
  }
  for (const p of list) {
    const item = document.createElement('div');
    item.className = 'item';
    const code = document.createElement('code');
    code.textContent = p;
    const del = document.createElement('m3e-button');
    del.setAttribute('variant', 'text');
    del.textContent = 'Убрать';
    del.addEventListener('click', () => removePath(p));
    item.append(code, del);
    box.append(item);
  }
}

async function addPath() {
  const p = $('pathInput').value.trim();
  if (!PATH_RE.test(p)) {
    toast('Путь должен начинаться с / и содержать только латиницу, цифры, . _ - /');
    return;
  }
  const list = await readPaths();
  if (list.includes(p)) {
    toast('Этот путь уже в списке');
    return;
  }
  const exists = await exec(`[ -e ${q(p)} ] && echo yes`);
  if (!exists.stdout.includes('yes')) {
    toast('Файла или папки по этому пути нет');
    return;
  }
  list.push(p);
  await writePaths(list);
  await exec(`${q(BIN)} add_sus_path ${q(p)}`);
  $('pathInput').value = '';
  renderPaths(list);
  toast('Путь добавлен');
}

async function removePath(p) {
  const list = (await readPaths()).filter((x) => x !== p);
  await writePaths(list);
  renderPaths(list);
  toast('Убрано из списка. В ядре путь скрыт до перезагрузки');
}

async function applyAll() {
  const list = await readPaths();
  for (const p of list) {
    await exec(`${q(BIN)} add_sus_path ${q(p)}`);
  }
  toast(list.length ? 'Пути отправлены в ядро, результат смотри в dmesg' : 'Список пуст');
}

async function setLog(on) {
  await exec(`printf '%s' ${on ? 1 : 0} > ${q(`${CONF}/log`)}`);
  await exec(`${q(BIN)} enable_log ${on ? 1 : 0}`);
}

async function runUmount() {
  await exec(`${q(BIN)} run_umount`);
  toast('Try umount выполнен');
}

function renderFeatures(text) {
  const box = $('features');
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

async function loadStatus() {
  const kernel = await exec('uname -r');
  $('kernel').textContent = `ядро: ${kernel.stdout.trim()}`;

  const version = (await exec(`${q(BIN)} show_version`)).stdout.trim();
  const variant = (await exec(`${q(BIN)} show_variant`)).stdout.trim();
  const susfs = $('susfs');
  if (version) {
    susfs.textContent = `SUSFS ${version} (${variant})`;
    susfs.className = 'chip ok';
  } else {
    susfs.textContent = 'SUSFS: нет ответа от ядра';
    susfs.className = 'chip off';
  }

  renderFeatures((await exec(`${q(BIN)} show_features`)).stdout);
}

async function loadLog() {
  const saved = (await exec(`cat ${q(`${CONF}/log`)} 2>/dev/null`)).stdout.trim();
  $('logSwitch').checked = saved !== '0';
}

async function refreshPaths() {
  renderPaths(await readPaths());
}

function init() {
  if (typeof ksu === 'undefined') {
    $('noBridge').hidden = false;
    document.querySelectorAll('m3e-button, m3e-switch').forEach((el) => {
      el.disabled = true;
    });
    return;
  }
  $('addBtn').addEventListener('click', addPath);
  $('pathInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPath();
  });
  $('applyBtn').addEventListener('click', applyAll);
  $('umountBtn').addEventListener('click', runUmount);
  $('logSwitch').addEventListener('change', (e) => setLog(e.target.checked));

  loadStatus();
  loadLog();
  refreshPaths();
}

init();
