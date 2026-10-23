import { getLanguage, t, type MessageKey } from '../logic/i18n';

/**
 * Fills the text of index.html. An element carries `data-i18n="key"` for its text, or
 * `data-i18n-aria-label="key"` for its label; tests/webui/i18n.test.mjs checks every key exists.
 */
export function translateDocument(root: ParentNode = document): void {
  document.documentElement.lang = getLanguage();
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = t(element.dataset['i18n'] as MessageKey);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset['i18nAriaLabel'] as MessageKey));
  }
}
