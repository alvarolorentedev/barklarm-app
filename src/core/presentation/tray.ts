import { State } from '../../types/State';
import { Status } from '../../types/Status';
import { translate } from '../i18n';

const MAX_NAMES = 3;
// Windows silently truncates tray tooltips at 128 characters.
const MAX_LENGTH = 120;

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim() || translate('Unknown');
}

function nameList(names: string[]): string {
  if (names.length <= MAX_NAMES) return names.join(', ');
  return `${names.slice(0, MAX_NAMES).join(', ')} +${names.length - MAX_NAMES}`;
}

function countLabel(count: number, key: 'failed' | 'unavailable' | 'checking' | 'healthy'): string {
  return `${count} ${translate(count === 1 ? `${key} source` : `${key} sources`)}`;
}

/** One-line tray tooltip: where to look, without repeating the whole Radiator. */
export function trayTooltip(states: State[]): string {
  if (states.length === 0) return 'Barklarm';

  const groups = [
    { status: Status.FAILURE, key: 'failed', names: true },
    { status: Status.NA, key: 'unavailable', names: true },
    { status: Status.CHECKING, key: 'checking', names: false },
  ] as const;

  const parts: string[] = [];
  for (const { status, key, names } of groups) {
    const matching = states.filter((state) => state.status === status);
    if (matching.length === 0) continue;
    const label = countLabel(matching.length, key);
    parts.push(names ? `${label}: ${nameList(matching.map((state) => cleanName(state.name)))}` : label);
  }

  if (parts.length === 0) return countLabel(states.length, 'healthy');

  const text = parts.join(' · ');
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}
