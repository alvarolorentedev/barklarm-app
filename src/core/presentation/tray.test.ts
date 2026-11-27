import { describe, expect, it } from 'vitest';
import { trayTooltip } from './tray';
import { State } from '../../types/State';
import { Status } from '../../types/Status';

const state = (name: string, status: Status): State => ({ id: name, name, status, link: '' });

describe('trayTooltip', () => {
  it('falls back to the app name without sources', () => {
    expect(trayTooltip([])).toBe('Barklarm');
  });

  it('counts healthy sources', () => {
    expect(trayTooltip([state('api', Status.SUCCESS)])).toBe('1 healthy');
    expect(trayTooltip([state('api', Status.SUCCESS), state('web', Status.SUCCESS)])).toBe('2 healthy');
  });

  it('names failures and unavailable sources, counts the rest', () => {
    expect(
      trayTooltip([
        state('web', Status.FAILURE),
        state('api', Status.FAILURE),
        state('docs', Status.NA),
        state('nightly', Status.CHECKING),
        state('healthy', Status.SUCCESS),
      ])
    ).toBe('2 failed: web, api · 1 unavailable: docs · 1 checking');
  });

  it('summarizes checking sources before the first result arrives', () => {
    expect(trayTooltip([state('api', Status.CHECKING)])).toBe('1 checking');
  });

  it('caps long name lists', () => {
    const failures = ['a', 'b', 'c', 'd'].map((name) => state(name, Status.FAILURE));
    expect(trayTooltip(failures)).toBe('4 failed: a, b, c +1');
  });

  it('keeps the tooltip under the Windows length limit', () => {
    const failures = Array.from({ length: 20 }, (_, index) => state(`${'x'.repeat(40)}-${index}`, Status.FAILURE));
    const tooltip = trayTooltip(failures);
    expect(tooltip.length).toBeLessThanOrEqual(120);
    expect(tooltip.endsWith('…')).toBe(true);
  });

  it('collapses whitespace in names', () => {
    expect(trayTooltip([state('  web\n\tapp ', Status.FAILURE)])).toBe('1 failed: web app');
  });

  it('replaces a blank name', () => {
    expect(trayTooltip([state('  ', Status.FAILURE)])).toBe('1 failed: Unknown');
  });
});
