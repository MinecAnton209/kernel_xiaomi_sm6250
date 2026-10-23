import { SPOOF, quote } from '../core/config';
import { busy, byId, type SelectElement, type SwitchElement, type Togglable } from '../core/dom';
import { exec, rebootPhone } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { toast } from '../core/toast';
import { showDialog } from '../ui/dialog';
import { askReboot } from '../ui/rebootDialog';
import {
  CUSTOM_PROFILE,
  DEVICE_FIELDS,
  DEVICE_GROUPS,
  DEVICE_KEYS,
  DEVICE_PRESETS,
  devicePayload,
  formatMemory,
  isAdvancedKey,
  matchProfile,
  normalizeDeviceValues,
  parseDevice,
  validateDeviceApps,
  validateDeviceValues,
  type DeviceScope,
  type DeviceState,
} from '../logic/device';
import { t } from '../logic/i18n';
import { parseMissing, parsePackages } from '../logic/uname';

const FORM_CONTROLS = [
  'deviceSwitch',
  'deviceProfile',
  'deviceScope',
  'deviceAppInput',
  'deviceAddApp',
  'deviceProps',
  'deviceZygiskSwitch',
  'deviceApply',
  'deviceReset',
] as const;

/** Exit code of `spoof.sh apply` for a kernel without the device_spoof interface. */
const EXIT_UNSUPPORTED = 3;

let selectedApps: string[] = [];
/** The form as it was last filled from the module; undefined until the first load. */
let baseline: string | undefined;

let optionsBuilt = false;
let fieldsBuilt = false;

const input = (id: string) => byId<HTMLInputElement>(id);
const select = (id: string) => byId<SelectElement>(id);
const fieldId = (key: string) => `deviceField_${key}`;
const fieldInput = (key: string) => byId<HTMLInputElement>(fieldId(key));

function buildProfileOptions(): void {
  if (optionsBuilt) return;
  optionsBuilt = true;
  const custom = document.createElement('m3e-option');
  custom.setAttribute('value', CUSTOM_PROFILE);
  custom.textContent = t('device.profileCustom');
  const options = DEVICE_PRESETS.map((preset) => {
    const option = document.createElement('m3e-option');
    option.setAttribute('value', preset.id);
    option.textContent = preset.label;
    return option;
  });
  select('deviceProfile').append(custom, ...options);
}

function renderFields(): void {
  if (fieldsBuilt) return;
  fieldsBuilt = true;
  const box = byId('deviceFields');
  for (const group of DEVICE_GROUPS) {
    const section = document.createElement('div');
    section.className = 'device-group';
    const title = document.createElement('h3');
    title.textContent = t(group.title);
    section.append(title);
    for (const field of DEVICE_FIELDS.filter((candidate) => candidate.group === group.id)) {
      const label = document.createElement('label');
      label.className = 'field-label';
      label.htmlFor = fieldId(field.key);
      label.textContent = field.label;
      const control = document.createElement('input');
      control.className = 'field';
      control.id = fieldId(field.key);
      control.maxLength = field.maxLength;
      control.autocomplete = 'off';
      control.autocapitalize = 'off';
      control.spellcheck = false;
      if (field.type === 'freqs') control.placeholder = '1800000 1800000 …';
      if (isAdvancedKey(field.key)) {
        label.dataset.advanced = '';
        control.dataset.advanced = '';
      }
      control.addEventListener('input', () => {
        select('deviceProfile').value = CUSTOM_PROFILE;
      });
      section.append(label, control);
    }
    box.append(section);
  }
}

function setControlsDisabled(disabled: boolean): void {
  for (const id of FORM_CONTROLS) byId<Togglable>(id).disabled = disabled;
  for (const key of DEVICE_KEYS) fieldInput(key).disabled = disabled;
}

function syncStatus(state: DeviceState): void {
  const kernel = byId('deviceKernel');
  kernel.textContent = t(state.supported ? 'device.kernelReady' : 'device.kernelMissing');
  kernel.className = `chip ${state.supported ? 'ok' : 'off'}`;

  const zygisk = byId('deviceZygisk');
  zygisk.textContent = t(state.neozygisk ? 'device.zygiskReady' : 'device.zygiskMissing');
  zygisk.className = `chip ${state.neozygisk ? 'ok' : 'off'}`;
  // Without a Zygisk loader the payload in the module is never loaded, so the switch cannot work.
  const zygiskSwitch = byId<SwitchElement>('deviceZygiskSwitch');
  zygiskSwitch.disabled = !state.neozygisk;
  if (!state.neozygisk) zygiskSwitch.checked = false;

  const parts = [
    state.real.socMachine || state.real.hardware || state.real.processor,
    state.real.gpu,
    formatMemory(state.real.memTotalKb),
  ].filter((part) => part !== '');
  byId('deviceReal').textContent = t('device.real', { value: parts.join(' · ') || '?' });
}

function showScope(): void {
  byId('deviceAppsBlock').hidden = select('deviceScope').value !== 'selected';
}

function renderApps(): void {
  const box = byId('deviceApps');
  box.replaceChildren();
  if (selectedApps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('device.noApps');
    box.append(empty);
    return;
  }
  for (const name of selectedApps) {
    const item = document.createElement('div');
    item.className = 'item';
    const code = document.createElement('code');
    code.textContent = name;
    const remove = document.createElement('m3e-button');
    remove.setAttribute('variant', 'text');
    remove.textContent = t('device.remove');
    remove.addEventListener('click', () => {
      selectedApps = selectedApps.filter((app) => app !== name);
      renderApps();
    });
    item.append(code, remove);
    box.append(item);
  }
}

function readValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of DEVICE_KEYS) values[key] = fieldInput(key).value;
  return values;
}

/** Everything the user can change, as one string: a difference from the baseline is an unsaved edit. */
function snapshot(): string {
  return JSON.stringify({
    values: readValues(),
    enabled: byId<SwitchElement>('deviceSwitch').checked,
    props: byId<SwitchElement>('deviceProps').checked,
    zygisk: byId<SwitchElement>('deviceZygiskSwitch').checked,
    scope: currentScope(),
    apps: selectedApps,
    profile: select('deviceProfile').value,
  });
}

function hasEdits(): boolean {
  return baseline !== undefined && snapshot() !== baseline;
}

function setAdvancedVisible(visible: boolean): void {
  for (const element of document.querySelectorAll<HTMLElement>('#deviceForm [data-advanced]')) {
    element.hidden = !visible;
  }
}

/**
 * Asks before Advanced mode is switched on, every time: the checkbox must be ticked before the
 * Enable button works. Closing the dialog any other way keeps the mode off.
 */
async function confirmAdvanced(): Promise<boolean> {
  const ack = byId<SwitchElement>('advancedAck');
  ack.checked = false;
  byId<Togglable>('advancedEnable').disabled = true;
  const result = await showDialog('advancedDialog', 'cancel');
  return result === 'enable' && ack.checked;
}

async function toggleAdvanced(advanced: SwitchElement): Promise<void> {
  if (!advanced.checked) {
    setAdvancedVisible(false);
    return;
  }
  const confirmed = await confirmAdvanced();
  advanced.checked = confirmed;
  setAdvancedVisible(confirmed);
}

function fillForm(state: DeviceState): void {
  const values = normalizeDeviceValues(state.values);
  if (!DEVICE_KEYS.some((key) => (values[key] ?? '') !== '')) {
    const first = DEVICE_PRESETS[0];
    if (first) for (const key of DEVICE_KEYS) values[key] = first.values[key];
  }
  for (const key of DEVICE_KEYS) fieldInput(key).value = values[key] ?? '';
  byId<SwitchElement>('deviceSwitch').checked = state.enabled;
  byId<SwitchElement>('deviceProps').checked = state.props;
  byId<SwitchElement>('deviceZygiskSwitch').checked = state.zygisk && state.neozygisk;
  select('deviceScope').value = state.scope;
  selectedApps = [...state.apps];
  const profile = state.profile || matchProfile(values);
  select('deviceProfile').value = DEVICE_PRESETS.some((preset) => preset.id === profile) ? profile : CUSTOM_PROFILE;
  showScope();
  renderApps();
  baseline = snapshot();
}

function fillSuggestions(packages: readonly string[]): void {
  byId('devicePackages').replaceChildren(
    ...packages.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
}

/**
 * Reads the module and fills the form. Edits the user has not applied are kept, so a refresh never
 * wipes them; only `force` (after Apply, Reset or Discard) replaces the form with what is saved.
 */
export async function loadDevice(force = false): Promise<void> {
  buildProfileOptions();
  renderFields();
  try {
    const { stdout } = await exec(joinCommands([`${quote(SPOOF)} get`, `${quote(SPOOF)} apps`]));
    const [info = '', apps = ''] = splitSections(stdout);
    const state = parseDevice(info);
    syncStatus(state);
    fillSuggestions(parsePackages(apps));
    if (force || baseline === undefined || !hasEdits()) fillForm(state);
    setControlsDisabled(!state.supported);
  } catch {
    toast(t('device.loadFailed'));
  }
}

function addApp(): void {
  const field = input('deviceAppInput');
  const name = field.value.trim();
  if (name === '') return;
  const problem = validateDeviceApps([...selectedApps, name]);
  if (problem) {
    toast(t(problem));
    return;
  }
  selectedApps = [...selectedApps, name];
  field.value = '';
  renderApps();
}

function currentScope(): DeviceScope {
  switch (select('deviceScope').value) {
    case 'all':
      return 'all';
    case 'root':
      return 'root';
    case 'selected':
      return 'selected';
    default:
      return 'apps';
  }
}

/** True while the form holds edits that Apply has not sent yet. */
export function hasUnsavedDevice(): boolean {
  return hasEdits();
}

/** Drops the edits: the form is read again from what is saved. */
export async function discardDevice(): Promise<void> {
  await loadDevice(true);
}

/** Sends the form to the module. Resolves to true when it was applied, false when it was refused. */
export async function saveDevice(): Promise<boolean> {
  const values = normalizeDeviceValues(readValues());
  const problem = validateDeviceValues(values) ?? validateDeviceApps(selectedApps);
  if (problem) {
    toast(t(problem));
    return false;
  }

  const enabled = byId<SwitchElement>('deviceSwitch').checked;
  const profile = select('deviceProfile').value || CUSTOM_PROFILE;
  const payload = devicePayload({
    enabled,
    profile,
    scope: currentScope(),
    apps: selectedApps,
    props: byId<SwitchElement>('deviceProps').checked,
    zygisk: byId<SwitchElement>('deviceZygiskSwitch').checked,
    values,
  });

  const result = await exec(`${quote(SPOOF)} set ${quote(payload)}`);
  if (result.errno === EXIT_UNSUPPORTED) {
    toast(t('device.unsupportedToast'));
    return false;
  }
  if (result.errno !== 0) {
    toast(result.stderr.trim() || t('common.commandFailed'));
    return false;
  }

  const missing = parseMissing(result.stdout);
  toast(missing.length > 0 ? t('device.missing', { apps: missing.join(', ') }) : t(enabled ? 'device.applied' : 'device.disabled'));
  await loadDevice(true);
  return true;
}

async function resetDevice(): Promise<void> {
  const result = await exec(`${quote(SPOOF)} reset`);
  if (result.errno !== 0) {
    toast(result.stderr.trim() || t('common.commandFailed'));
    return;
  }
  toast(t('device.resetDone'));
  await loadDevice(true);
}

export function initDevice(): void {
  buildProfileOptions();
  renderFields();

  select('deviceProfile').addEventListener('change', () => {
    const preset = DEVICE_PRESETS.find((candidate) => candidate.id === select('deviceProfile').value);
    if (preset) for (const key of DEVICE_KEYS) fieldInput(key).value = preset.values[key];
  });
  select('deviceScope').addEventListener('change', showScope);

  const advanced = byId<SwitchElement>('deviceAdvanced');
  advanced.checked = false;
  setAdvancedVisible(false);
  advanced.addEventListener('change', () => void toggleAdvanced(advanced));
  byId('advancedAck').addEventListener('change', () => {
    byId<Togglable>('advancedEnable').disabled = !byId<SwitchElement>('advancedAck').checked;
  });
  byId('deviceAddApp').addEventListener('click', addApp);
  input('deviceAppInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addApp();
  });

  const applyButton = byId<Togglable>('deviceApply');
  applyButton.addEventListener(
    'click',
    () =>
      void busy(applyButton, async () => {
        if ((await saveDevice()) && (await askReboot('device'))) await rebootPhone();
      }),
  );
  const resetButton = byId<Togglable>('deviceReset');
  resetButton.addEventListener(
    'click',
    () =>
      void busy(resetButton, async () => {
        await resetDevice();
      }),
  );
}
