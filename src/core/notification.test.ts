import { describe, expect, it, vi } from 'vitest';
import { Status } from '../types/Status';
import { NotificationManager } from './notification';

vi.mock('./i18n', () => ({
  translate: (value: string) => value,
}));

describe('NotificationManager', () => {
  it('notifies only when a status changes', () => {
    const show = vi.fn();
    const notifications = new NotificationManager(show);
    const previous = [{ name: 'build', status: Status.SUCCESS, link: '' }];

    notifications.updateNotifications(previous, [
      { name: 'build', status: Status.SUCCESS, link: '' },
      { name: 'deploy', status: Status.FAILURE, link: '' },
    ]);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith('Failed', 'deploy Failed');
  });

  it('does not notify muted observers', () => {
    const show = vi.fn();
    const notifications = new NotificationManager(show);

    notifications.updateNotifications([], [{ name: 'build', status: Status.FAILURE, link: '', muted: true }]);

    expect(show).not.toHaveBeenCalled();
  });
});
