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

  it('notifies when a new failure replaces an existing failure', () => {
    const show = vi.fn();
    const notifications = new NotificationManager(show);

    notifications.updateNotifications(
      [{ id: 'build', name: 'build', status: Status.FAILURE, link: '', error: { id: 'run-1', description: '' } }],
      [{ id: 'build', name: 'build', status: Status.FAILURE, link: '', error: { id: 'run-2', description: '' } }]
    );

    expect(show).toHaveBeenCalledWith('Failed', 'build Failed');
  });

  it('does not repeat a notification for the same failure event', () => {
    const show = vi.fn();
    const notifications = new NotificationManager(show);
    const state = {
      id: 'build',
      name: 'build',
      status: Status.FAILURE,
      link: '',
      error: { id: 'run-1', description: '' },
    };

    notifications.updateNotifications([state], [{ ...state }]);

    expect(show).not.toHaveBeenCalled();
  });

  it('matches observers by ID rather than a duplicate alias', () => {
    const show = vi.fn();
    const notifications = new NotificationManager(show);

    notifications.updateNotifications(
      [{ id: 'a', name: 'API build', status: Status.SUCCESS, link: '' }],
      [{ id: 'b', name: 'API build', status: Status.FAILURE, link: '' }]
    );

    expect(show).toHaveBeenCalledWith('Failed', 'API build Failed');
  });
});
