import { isHttpUrl } from '../../../core/issue';

/** Only plain HTTP(S) links without embedded credentials may be opened from presentation. */
export function safeExternalUrl(value: string | undefined): boolean {
  if (!value || !isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}
