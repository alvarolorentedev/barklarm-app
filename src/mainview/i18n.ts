import en from '../assets/translations/en.json';
import es from '../assets/translations/es.json';

const localeMap: Record<string, Record<string, string>> = { en, es };
const locale = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
const messages = localeMap[locale] || en;

export function translate(id: string): string {
  return messages[id] ?? id;
}
