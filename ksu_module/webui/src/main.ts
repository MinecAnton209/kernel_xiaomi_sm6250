import '@m3e/web/button';
import '@m3e/web/switch';
import '@m3e/web/loading-indicator';
import '@m3e/web/progress-indicator';
import './style.css';
import { hasBridge } from './ksu';
import { addPath, applyAll } from './paths';
import { byId, busy, type Togglable, type SwitchElement } from './dom';
import { prefetchPages, refreshCurrentPage, savedTab, showPage } from './nav';
import { initPullToRefresh } from './pull';
import { runUmount, setBypass, setLog, startLivePolling } from './system';
import { setSusSu } from './su';
import { initTuneHelp } from './tune';
import { initUpdates, loadChannel } from './updates';

function init(): void {
  document.querySelectorAll<HTMLElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => showPage(button.dataset['tab'] ?? 'status'));
  });

  initTuneHelp();

  if (!hasBridge()) {
    byId('noBridge').hidden = false;
    document.querySelectorAll<Togglable>('m3e-button, m3e-switch').forEach((el) => {
      el.disabled = true;
    });
    return;
  }

  const addButton = byId<Togglable>('addBtn');
  addButton.addEventListener('click', () => void busy(addButton, addPath));
  byId<HTMLInputElement>('pathInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void addPath();
  });

  const applyButton = byId<Togglable>('applyBtn');
  applyButton.addEventListener('click', () => void busy(applyButton, applyAll));

  const umountButton = byId<Togglable>('umountBtn');
  umountButton.addEventListener('click', () => void busy(umountButton, runUmount));

  byId<SwitchElement>('logSwitch').addEventListener('change', (event) => {
    void setLog((event.target as SwitchElement).checked);
  });
  byId<SwitchElement>('bypassSwitch').addEventListener('change', (event) => {
    void setBypass((event.target as SwitchElement).checked);
  });
  byId<SwitchElement>('susSuSwitch').addEventListener('change', (event) => {
    void setSusSu((event.target as SwitchElement).checked);
  });

  void loadChannel().then(initUpdates);
  showPage(savedTab());
  prefetchPages();
  startLivePolling();
  initPullToRefresh(refreshCurrentPage);
}

init();
