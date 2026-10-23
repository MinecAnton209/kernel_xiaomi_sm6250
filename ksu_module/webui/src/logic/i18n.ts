// The tests load logic/ with Node, which needs the .ts extension on a runtime import.
import { en } from './locales/en.ts';
import { ru, type MessageKey } from './locales/ru.ts';

export type { MessageKey };
export type Language = 'ru' | 'en';
export type Params = Readonly<Record<string, string | number>>;

const CATALOGS: Record<Language, Record<MessageKey, string>> = { ru, en };

/** English is the fallback: a phone whose language has no catalog gets English, not Russian. */
const FALLBACK: Language = 'en';

let current: Language = FALLBACK;

/** Picks the first supported language from a list of BCP 47 tags, in the order the browser prefers them. */
export function pickLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (primary === 'ru') return 'ru';
    if (primary === 'en') return 'en';
  }
  return FALLBACK;
}

export function setLanguage(language: Language): void {
  current = language;
}

export function getLanguage(): Language {
  return current;
}

/** Replaces each `{name}` with the matching parameter; a name without a parameter stays as written. */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function t(key: MessageKey, params?: Params): string {
  return format(CATALOGS[current][key], params);
}

export function messageKeys(language: Language): MessageKey[] {
  return Object.keys(CATALOGS[language]) as MessageKey[];
}
