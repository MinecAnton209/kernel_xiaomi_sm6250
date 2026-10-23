import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CUSTOM_PROFILE,
  DEVICE_FIELDS,
  DEVICE_GROUPS,
  DEVICE_KEYS,
  DEVICE_PRESETS,
  devicePayload,
  formatMemory,
  matchProfile,
  normalizeDeviceValues,
  parseDevice,
  validateDeviceApps,
  validateDeviceValues,
} from '../../webui/src/logic/device.ts';

const WEBUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
const MODULE = join(WEBUI, '..', 'kernel_control');
const read = (file) => readFileSync(join(WEBUI, file), 'utf8');

test('parseDevice reads the status, the scope, the app list and every value', () => {
  const state = parseDevice(
    [
      'supported=1',
      'neozygisk=1',
      'enabled=1',
      'profile=pixel-6',
      'scope=root',
      'apps=com.a.b com.c.d',
      'props=1',
      'zygisk=0',
      'real_processor=AArch64 Processor rev 1 (aarch64)',
      'real_cpu_hardware=Qualcomm Technologies, Inc SM7125',
      'real_gpu=Adreno (TM) 618',
      'real_mem_total_kb=5700000',
      'real_soc_machine=Qualcomm Technologies, Inc. SM7125',
      'brand=google',
      'model=Pixel 6',
      'dt_compatible=google,oriole',
      'cpu_max_freqs=1800000 2300000',
      'nonsense=ignored',
    ].join('\n'),
  );

  assert.equal(state.supported, true);
  assert.equal(state.neozygisk, true);
  assert.equal(state.enabled, true);
  assert.equal(state.profile, 'pixel-6');
  assert.equal(state.scope, 'root');
  assert.deepEqual(state.apps, ['com.a.b', 'com.c.d']);
  assert.equal(state.props, true);
  assert.equal(state.zygisk, false);
  assert.equal(state.real.processor, 'AArch64 Processor rev 1 (aarch64)');
  assert.equal(state.real.hardware, 'Qualcomm Technologies, Inc SM7125');
  assert.equal(state.real.gpu, 'Adreno (TM) 618');
  assert.equal(state.real.memTotalKb, '5700000');
  assert.equal(state.real.socMachine, 'Qualcomm Technologies, Inc. SM7125');
  assert.equal(state.values['brand'], 'google');
  assert.equal(state.values['model'], 'Pixel 6');
  assert.equal(state.values['cpu_max_freqs'], '1800000 2300000');
  assert.equal(state.values['soc_family'], '');
});

test('parseDevice on a fresh install is off, shows every app and has no values', () => {
  const state = parseDevice('supported=1\nenabled=\nscope=\napps=\nprops=\nzygisk=\n');
  assert.equal(state.enabled, false);
  assert.equal(state.scope, 'apps');
  assert.deepEqual(state.apps, []);
  assert.equal(state.props, false);
  assert.equal(state.zygisk, false);
  for (const key of DEVICE_KEYS) assert.equal(state.values[key], '');
});

test('parseDevice marks an old kernel and a missing NeoZygisk as unavailable', () => {
  const state = parseDevice('supported=0\nneozygisk=0');
  assert.equal(state.supported, false);
  assert.equal(state.neozygisk, false);
  assert.equal(parseDevice('').supported, false);
});

test('an unknown scope is read as every app without su', () => {
  assert.equal(parseDevice('scope=everyone').scope, 'apps');
  assert.equal(parseDevice('scope=all').scope, 'all');
  assert.equal(parseDevice('scope=selected').scope, 'selected');
});

test('parseDevice survives carriage returns, blank lines, noise and equals signs', () => {
  const state = parseDevice('model=Pixel 6\r\n\r\nnonsense\r\nbio=a=b\r\napps=com.a.b\r\n');
  assert.equal(state.values['model'], 'Pixel 6');
  assert.deepEqual(state.apps, ['com.a.b']);
});

test('every field has a unique key and belongs to a known group', () => {
  const keys = DEVICE_FIELDS.map((field) => field.key);
  assert.equal(new Set(keys).size, keys.length);
  const groups = new Set(DEVICE_GROUPS.map((group) => group.id));
  for (const field of DEVICE_FIELDS) assert.equal(groups.has(field.group), true, field.key);
  for (const key of DEVICE_KEYS) assert.equal(keys.includes(key), true, key);
});

test('every ready-made profile is complete, valid and has a unique id', () => {
  assert.ok(DEVICE_PRESETS.length >= 4);
  const ids = DEVICE_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(CUSTOM_PROFILE));
  for (const preset of DEVICE_PRESETS) {
    assert.ok(preset.label.length > 0, preset.id);
    for (const key of DEVICE_KEYS) assert.notEqual(preset.values[key], '', `${preset.id}: ${key}`);
    assert.equal(validateDeviceValues(preset.values), undefined, preset.id);
  }
});

test('matchProfile finds a profile by all values and anything else is custom', () => {
  for (const preset of DEVICE_PRESETS) assert.equal(matchProfile(preset.values), preset.id);
  const first = DEVICE_PRESETS[0];
  assert.equal(matchProfile({ ...first.values, model: 'something else' }), CUSTOM_PROFILE);
  assert.equal(matchProfile({}), CUSTOM_PROFILE);
});

test('normalizeDeviceValues trims text and writes the frequency list with spaces', () => {
  const values = normalizeDeviceValues({ model: '  Pixel 6  ', cpu_max_freqs: '1800000,2300000' });
  assert.equal(values['model'], 'Pixel 6');
  assert.equal(values['cpu_max_freqs'], '1800000 2300000');
});

test('text, numbers and frequency lists follow the rules of spoof.sh', () => {
  assert.equal(validateDeviceValues({}), undefined);
  assert.equal(validateDeviceValues({ model: 'Pixel 6' }), undefined);
  assert.equal(validateDeviceValues({ brand: 'a'.repeat(32) }), undefined);
  for (const bad of ['a'.repeat(33), 'default', '-', 'Pixel\n6', 'телефон']) {
    assert.equal(validateDeviceValues({ brand: bad }), 'device.invalidText', JSON.stringify(bad));
  }
  assert.equal(validateDeviceValues({ cpu_part: '0xd44' }), undefined);
  assert.equal(validateDeviceValues({ cpu_part: '0xzz' }), 'device.invalidNumber');
  assert.equal(validateDeviceValues({ mem_total_kb: '-1' }), 'device.invalidNumber');
  assert.equal(validateDeviceValues({ cpu_max_freqs: '1800000, 2300000' }), undefined);
  assert.equal(validateDeviceValues({ cpu_max_freqs: '1800000 nope' }), 'device.invalidFreqs');
  assert.equal(validateDeviceValues({ cpu_max_freqs: Array(17).fill('1').join(' ') }), 'device.invalidFreqs');
});

test('the app list follows the same package rules and limit as the shell', () => {
  assert.equal(validateDeviceApps([]), undefined);
  assert.equal(validateDeviceApps(['com.a.b', 'com.c.d']), undefined);
  assert.equal(validateDeviceApps(['com.a.b', 'com.a.b']), 'device.duplicate');
  assert.equal(validateDeviceApps(['nope']), 'device.invalidPackage');
  const full = Array.from({ length: 65 }, (_, index) => `com.app${index}.x`);
  assert.equal(validateDeviceApps(full), 'device.tooMany');
  assert.equal(validateDeviceApps(full.slice(1)), undefined);
});

test('devicePayload sends flags, apps and every field to spoof.sh', () => {
  const payload = devicePayload({
    enabled: true,
    profile: 'pixel-6',
    scope: 'selected',
    apps: ['com.a.b', 'com.c.d'],
    props: true,
    zygisk: false,
    values: { model: ' Pixel 6 ', cpu_max_freqs: '1800000,2300000' },
  });
  assert.match(payload, /^enabled=1$/m);
  assert.match(payload, /^profile=pixel-6$/m);
  assert.match(payload, /^scope=selected$/m);
  assert.match(payload, /^apps=com\.a\.b com\.c\.d$/m);
  assert.match(payload, /^props=1$/m);
  assert.match(payload, /^zygisk=0$/m);
  assert.match(payload, /^model=Pixel 6$/m);
  assert.match(payload, /^cpu_max_freqs=1800000 2300000$/m);
  for (const key of DEVICE_KEYS) assert.match(payload, new RegExp(`^${key}=`, 'm'), key);
});

test('formatMemory shows the size in the unit the system uses', () => {
  assert.equal(formatMemory('5700000'), '5.4 GB');
  assert.equal(formatMemory('7600000'), '7.2 GB');
  assert.equal(formatMemory(''), '');
  assert.equal(formatMemory('nope'), '');
});

test('the Device tab has every control the page looks up', () => {
  const html = read('index.html');
  for (const id of [
    'deviceKernel', 'deviceZygisk', 'deviceReal', 'deviceSwitch', 'deviceProfile', 'deviceScope',
    'deviceAppsBlock', 'deviceAppInput', 'deviceAddApp', 'devicePackages', 'deviceApps', 'deviceProps',
    'deviceZygiskSwitch', 'deviceFields', 'deviceApply', 'deviceReset',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from index.html`);
  }
  assert.match(html, /id="deviceAppsBlock" hidden/);
  for (const value of ['apps', 'all', 'root', 'selected']) {
    assert.match(html, new RegExp(`<m3e-option value="${value}"`));
  }
});

test('the tab is registered, prefetched, guarded and initialized', () => {
  const nav = read('src/nav.ts');
  assert.match(nav, /device: loadDevice/);
  assert.match(nav, /device: \{ hasUnsaved: hasUnsavedDevice, save: saveDevice, discard: discardDevice \}/);
  assert.ok(read('src/main.ts').includes('initDevice();'));
});

test('the page applies through spoof.sh set with a quoted payload', () => {
  const page = read('src/pages/device.ts');
  assert.ok(page.includes('quote(SPOOF)} set ${quote(payload)}'));
  assert.ok(page.includes('if (!dirty) fillForm(state);'));
  assert.ok(page.includes('devicePayload('));
});

test('the WebUI field list matches the shell config keys', () => {
  const shell = readFileSync(join(MODULE, 'bin', 'spoof.sh'), 'utf8');
  const config = shell.match(/^CONFIG_KEYS="([^"]+)"/m)?.[1]?.split(' ') ?? [];
  const kernel = shell.match(/^KERNEL_KEYS="([^"]+)"/m)?.[1]?.split(' ') ?? [];
  for (const key of DEVICE_KEYS) assert.ok(config.includes(key), `${key} is not a shell setting`);
  for (const key of [
    'cpu_hardware', 'cpu_processor', 'cpu_model_name', 'cpu_implementer', 'cpu_architecture',
    'cpu_variant', 'cpu_part', 'cpu_revision', 'cpu_max_freqs', 'gpu_model', 'gpu_max_clk',
    'soc_machine', 'soc_family', 'soc_id', 'soc_revision', 'mem_total_kb', 'dt_model', 'dt_compatible',
  ]) {
    assert.ok(kernel.includes(key), `${key} is not sent to the kernel`);
  }
  assert.ok(shell.includes('add_prop ro.product.name product'));
  assert.ok(shell.includes('add_prop ro.board.platform board'));
});

test('kernel text limits are one less than the kernel buffers that hold them', () => {
  const header = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../include/linux/devspoof.h'), 'utf8');
  const bufferSize = (name) => Number(new RegExp(`#define ${name}\\s+(\\d+)`).exec(header)[1]);
  const bufferOf = {
    cpu_hardware: 'DEVSPOOF_STR_LEN',
    cpu_processor: 'DEVSPOOF_STR_LEN',
    cpu_model_name: 'DEVSPOOF_STR_LEN',
    gpu_model: 'DEVSPOOF_STR_LEN',
    soc_machine: 'DEVSPOOF_STR_LEN',
    soc_family: 'DEVSPOOF_STR_LEN',
    soc_id: 'DEVSPOOF_STR_LEN',
    soc_revision: 'DEVSPOOF_STR_LEN',
    dt_model: 'DEVSPOOF_MODEL_LEN',
    dt_compatible: 'DEVSPOOF_COMPAT_LEN',
  };
  const checked = DEVICE_FIELDS.filter((field) => field.key in bufferOf);
  assert.equal(checked.length, Object.keys(bufferOf).length);
  for (const field of checked) {
    assert.equal(field.maxLength, bufferSize(bufferOf[field.key]) - 1, field.key);
  }
});

test('Apply offers a reboot only after the settings were saved', () => {
  const page = readFileSync(join(WEBUI, 'src/pages/device.ts'), 'utf8');
  assert.ok(page.includes("if ((await saveDevice()) && (await askReboot('device'))) await rebootPhone();"));
});
