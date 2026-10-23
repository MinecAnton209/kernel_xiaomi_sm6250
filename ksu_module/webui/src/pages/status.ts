import { BIN, DEBUG, SENSORS, quote } from '../core/config';
import { busy, byId, type Togglable } from '../core/dom';
import { exec } from '../core/ksu';
import { joinCommands, splitSections } from '../core/shellOut';
import { toast } from '../core/toast';
import { t } from '../logic/i18n';
import { buildLabel, featureSpecs } from '../logic/statusFormat';
import { parseSensors, sensorSpecs } from '../logic/sensorsFormat';
import { loadProfile } from './profile';
import { createChipList, type ChipList } from '../ui/chipList';

/** Runs debug.sh and shows its report, which the user can copy into a bug report. */
export function initDebugReport(): void {
  byId('debugReportBtn').addEventListener('click', () => {
    const button = byId<Togglable>('debugReportBtn');
    void busy(button, buildDebugReport);
  });
  byId('debugReportCopy').addEventListener('click', () => void copyDebugReport());
}

async function buildDebugReport(): Promise<void> {
  const result = await exec(`sh ${quote(DEBUG)} 2>&1`);
  const output = byId('debugReportText');
  output.textContent = result.stdout.trim() || t('status.debugFailed');
  output.hidden = false;
  byId('debugReportCopy').hidden = false;
}

async function copyDebugReport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(byId('debugReportText').textContent ?? '');
    toast(t('status.debugCopied'));
  } catch {
    toast(t('status.debugCopyFailed'));
  }
}

let featureChips: ChipList | undefined;
let sensorChips: ChipList | undefined;
let sensorsBusy = false;

const SENSOR_INTERVAL_MS = 5000;

export async function loadSensors(): Promise<void> {
  const result = await exec(`${quote(SENSORS)} info`);
  sensorChips ??= createChipList(byId('sensorChips'));
  sensorChips.update(sensorSpecs(parseSensors(result.stdout)));
}

function statusTabOpen(): boolean {
  return document.querySelector('.nav-item[data-tab="status"][aria-current="page"]') !== null;
}

/** Only polls while the Status tab is on screen, so a hidden page does not keep starting root shells. */
export function initSensorPolling(): void {
  window.setInterval(() => {
    if (sensorsBusy || document.hidden || !statusTabOpen()) return;
    sensorsBusy = true;
    loadSensors()
      .catch(() => undefined)
      .finally(() => {
        sensorsBusy = false;
      });
  }, SENSOR_INTERVAL_MS);
}

export async function loadStatus(): Promise<void> {
  const { stdout } = await exec(
    joinCommands([
      'uname -r',
      `${quote(BIN)} show_version`,
      `${quote(BIN)} show_variant`,
      `${quote(BIN)} show_features`,
      `${quote(BIN)} show_build`,
    ]),
  );
  const [kernel = '', version = '', variant = '', features = '', build = ''] = splitSections(stdout);

  byId('kernel').textContent = t('status.kernel', { version: kernel });

  const buildChip = byId('build');
  const label = buildLabel(build);
  buildChip.hidden = label === undefined;
  buildChip.textContent = label === undefined ? '' : t('status.build', { build: label });

  const susfs = byId('susfs');
  if (version) {
    susfs.textContent = `SUSFS ${version} (${variant})`;
    susfs.className = 'chip ok';
  } else {
    susfs.textContent = t('status.susfsNoReply');
    susfs.className = 'chip off';
  }

  featureChips ??= createChipList(byId('features'));
  featureChips.update(featureSpecs(features));

  await Promise.all([loadSensors(), loadProfile()]);
}
