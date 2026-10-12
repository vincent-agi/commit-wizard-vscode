import { EN } from './en';
import { FR } from './fr';

/** Every translatable message, typed so a missing or misspelled key fails to compile. */
export type MessageKey = keyof typeof EN;

const CATALOGS: Record<string, Record<string, string>> = { en: EN, fr: FR };

let catalog: Record<string, string> = EN;
let currentLanguage = 'en';

/**
 * Selects the language from a locale such as `fr`, `fr-CA` or `en-US`. Unsupported locales fall
 * back to English, and a key missing from a catalog falls back to its English text.
 */
export function setLocale(locale: string): void {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  currentLanguage = language in CATALOGS ? language : 'en';
  catalog = { ...EN, ...CATALOGS[currentLanguage] };
}

/** The language currently selected (`en` or `fr`). */
export function getLanguage(): string {
  return currentLanguage;
}

/** Translates `key`, replacing `{0}`, `{1}`, ... with `args`. */
export function t(key: MessageKey, ...args: (string | number)[]): string {
  return (catalog[key] ?? EN[key]).replace(/\{(\d+)\}/g, (match, index: string) =>
    args[Number(index)] !== undefined ? String(args[Number(index)]) : match,
  );
}

/** Languages the interface is available in. */
export const SUPPORTED_LANGUAGES = Object.keys(CATALOGS);
