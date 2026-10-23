import { PROFILE, quote } from '../core/config';
import { busy, byId, type Togglable } from '../core/dom';
import { exec, run } from '../core/ksu';
import { toast } from '../core/toast';
import { t, type MessageKey } from '../logic/i18n';
import { PROFILE_NAMES, activeProfile, type ProfileName } from '../logic/profileFormat';
import { hasUnsavedTune, reloadTune } from './tune';

const LABELS: Record<ProfileName, MessageKey> = {
  default: 'profile.default',
  performance: 'profile.performance',
  battery: 'profile.battery',
};

function markActive(active: ProfileName | undefined): void {
  for (const name of PROFILE_NAMES) {
    byId<Togglable>(`profile-${name}`).setAttribute('variant', name === active ? 'filled' : 'outlined');
  }
}

/** Shows which profile the module applied last; an unknown answer highlights none of them. */
export async function loadProfile(): Promise<void> {
  const result = await exec(`${quote(PROFILE)} current`);
  markActive(activeProfile(result.stdout));
}

async function applyProfile(name: ProfileName): Promise<void> {
  if (hasUnsavedTune()) {
    toast(t('profile.unsaved'));
    return;
  }
  await run(`${quote(PROFILE)} apply ${name}`, t('profile.applied', { name: t(LABELS[name]) }));
  void reloadTune();
  await loadProfile();
}

export function initProfiles(): void {
  for (const name of PROFILE_NAMES) {
    const button = byId<Togglable>(`profile-${name}`);
    button.addEventListener('click', () => void busy(button, () => applyProfile(name)));
  }
}
