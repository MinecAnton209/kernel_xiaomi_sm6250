import '@m3e/web/button';
import '@m3e/web/switch';
import '@m3e/web/loading-indicator';
import '@m3e/web/progress-indicator';
import '@m3e/web/skeleton';
import '@m3e/web/form-field';
import '@m3e/web/select';
import '@m3e/web/option';
import '@m3e/web/dialog';
import './style.css';
import { byId, busy, type Togglable, type SwitchElement } from './core/dom';
import { browserLanguages } from './core/lang';
import { hasBridge, warmUp } from './core/ksu';
import { prefetchPages, refreshCurrentPage, requestPage, savedTab, showPage } from './nav';
import { addPath, applyAll } from './pages/paths';
import { setSusSu } from './pages/su';
import { runUmount, setBypass, setLog, startLivePolling } from './pages/system';
import { initTuneActions, initTuneHelp } from './pages/tune';
import { initUpdates, loadChannel } from './pages/updates';
import { pickLanguage, setLanguage } from './logic/i18n';
import { initPullToRefresh } from './ui/pull';
import { translateDocument } from './ui/staticText';

function init(): void {
  setLanguage(pickLanguage(browserLanguages()));
  translateDocument();

  document.querySelectorAll<HTMLElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => void requestPage(button.dataset['tab'] ?? 'status'));
  });

  initTuneHelp();
  initTuneActions();

  if (!hasBridge()) {
    byId('noBridge').hidden = false;
    document.querySelectorAll<Togglable>('m3e-button, m3e-switch').forEach((el) => {
      el.disabled = true;
    });
    return;
  }

  warmUp();

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
