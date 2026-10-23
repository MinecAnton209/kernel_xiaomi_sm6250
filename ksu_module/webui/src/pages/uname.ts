import { UNAME, quote } from '../core/config';
import { busy, byId, type SelectElement, type SwitchElement, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { toast } from '../core/toast';
import { t } from '../logic/i18n';
import {
  CUSTOM_PRESET,
  UNAME_PRESETS,
  matchPreset,
  parseMissing,
  parsePackages,
  parseUname,
  validatePackage,
  validateText,
  type UnameScope,
  type UnameState,
} from '../logic/uname';

const FORM_CONTROLS = [
  'unameSwitch',
  'unamePreset',
  'unameRelease',
  'unameVersion',
  'unameScope',
  'unameAppInput',
  'unameAddApp',
  'unameApply',
] as const;

/** Exit code of `uname.sh` for a kernel that cannot limit the spoof to apps. */
const EXIT_UNSUPPORTED = 3;

let selectedApps: string[] = [];
// Edits that were not applied yet. A reload of the tab must not overwrite what is being typed.
let dirty = false;
let optionsBuilt = false;

const input = (id: string) => byId<HTMLInputElement>(id);
const select = (id: string) => byId<SelectElement>(id);

function buildPresetOptions(): void {
  if (optionsBuilt) return;
  optionsBuilt = true;
  const custom = document.createElement('m3e-option');
  custom.setAttribute('value', CUSTOM_PRESET);
  custom.textContent = t('uname.presetCustom');
  const options = UNAME_PRESETS.map((preset) => {
    const option = document.createElement('m3e-option');
    option.setAttribute('value', preset.id);
    option.textContent = preset.label;
    return option;
  });
  select('unamePreset').append(custom, ...options);
}

function setControlsDisabled(disabled: boolean): void {
  for (const id of FORM_CONTROLS) byId<Togglable>(id).disabled = disabled;
}

function syncPreset(): void {
  select('unamePreset').value = matchPreset(input('unameRelease').value.trim(), input('unameVersion').value.trim());
}

function showScope(): void {
  byId('unameAppsBlock').hidden = select('unameScope').value !== 'selected';
}

function renderApps(): void {
  const box = byId('unameApps');
  box.replaceChildren();
  if (selectedApps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('uname.noApps');
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
    remove.textContent = t('uname.remove');
    remove.addEventListener('click', () => {
      selectedApps = selectedApps.filter((app) => app !== name);
      dirty = true;
      renderApps();
    });
    item.append(code, remove);
    box.append(item);
  }
}

function fillForm(state: UnameState): void {
  // A fresh install starts from the first ready-made option, so the form is never empty.
  const first = UNAME_PRESETS[0];
  input('unameRelease').value = state.release || first?.release || '';
  input('unameVersion').value = state.version || first?.version || '';
  byId<SwitchElement>('unameSwitch').checked = state.enabled;
  select('unameScope').value = state.scope satisfies UnameScope;
  selectedApps = [...state.apps];
  syncPreset();
  showScope();
  renderApps();
}

function fillSuggestions(packages: readonly string[]): void {
  byId('unamePackages').replaceChildren(
    ...packages.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
}

export async function loadUname(): Promise<void> {
  buildPresetOptions();
  try {
    const { stdout } = await exec(joinCommands([`${quote(UNAME)} get`, `${quote(UNAME)} apps`]));
    const [info = '', apps = ''] = splitSections(stdout);
    const state = parseUname(info);

    byId('unameReal').textContent = t('uname.real', { value: state.real || '?' });
    byId('unameUnsupported').hidden = state.supported;
    fillSuggestions(parsePackages(apps));
    if (!dirty) fillForm(state);
    setControlsDisabled(!state.supported);
  } catch {
    toast(t('uname.loadFailed'));
  }
}

function addApp(): void {
  const field = input('unameAppInput');
  const name = field.value.trim();
  if (name === '') return;
  const problem = validatePackage(name, selectedApps);
  if (problem) {
    toast(t(problem));
    return;
  }
  selectedApps = [...selectedApps, name];
  field.value = '';
  dirty = true;
  renderApps();
}

async function apply(): Promise<void> {
  const release = input('unameRelease').value.trim();
  const version = input('unameVersion').value.trim();
  const problem = validateText(release) ?? validateText(version);
  if (problem) {
    toast(t(problem));
    return;
  }

  const enabled = byId<SwitchElement>('unameSwitch').checked;
  const scope = select('unameScope').value === 'selected' ? 'selected' : 'apps';
  const command = [
    quote(UNAME),
    'set',
    enabled ? '1' : '0',
    quote(release),
    quote(version),
    scope,
    ...selectedApps.map(quote),
  ].join(' ');

  const result = await exec(command);
  if (result.errno === EXIT_UNSUPPORTED) {
    toast(t('uname.unsupportedToast'));
    return;
  }
  if (result.errno !== 0) {
    toast(result.stderr.trim() || t('common.commandFailed'));
    return;
  }

  dirty = false;
  const missing = parseMissing(result.stdout);
  toast(missing.length > 0 ? t('uname.missing', { apps: missing.join(', ') }) : t(enabled ? 'uname.applied' : 'uname.disabled'));
  await loadUname();
}

export function initUname(): void {
  const markDirty = () => {
    dirty = true;
  };

  for (const id of ['unameRelease', 'unameVersion']) {
    input(id).addEventListener('input', () => {
      markDirty();
      syncPreset();
    });
  }
  select('unamePreset').addEventListener('change', () => {
    const preset = UNAME_PRESETS.find((candidate) => candidate.id === select('unamePreset').value);
    if (!preset) return;
    input('unameRelease').value = preset.release;
    input('unameVersion').value = preset.version;
    markDirty();
  });
  select('unameScope').addEventListener('change', () => {
    markDirty();
    showScope();
  });
  byId('unameSwitch').addEventListener('change', markDirty);
  byId('unameAddApp').addEventListener('click', addApp);
  input('unameAppInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addApp();
  });
  const applyButton = byId<Togglable>('unameApply');
  applyButton.addEventListener('click', () => void busy(applyButton, apply));
}
