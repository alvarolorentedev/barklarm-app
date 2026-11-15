import en from '../assets/translations/en.json';
import es from '../assets/translations/es.json';

const localeMap: Record<string, Record<string, string>> = { en, es };
let loadedLanguage: Record<string, string> = en;

export function initialize(locale: string): void {
  loadedLanguage = localeMap[locale.toLowerCase()] || en;
}

export function translate(id: string): string {
  return loadedLanguage[id] ?? id;
}
