import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../types/Status';
import { Observer } from '../types/Observer';
import { State } from '../types/State';
import { ObserverManager } from './observer-manager';

function observer(state: State): Observer {
  return { getState: async () => state } as Observer;
}

function createManager(factory: (config: any) => Promise<Observer | undefined>) {
  const presenter = { updateImage: vi.fn(), updateMenu: vi.fn() };
  const notifications = { updateNotifications: vi.fn() };
  const manager = new ObserverManager(presenter, notifications as any, factory);
  return { manager, presenter, notifications };
}

describe('ObserverManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the worst status and the per-observer states', async () => {
    const { manager, presenter, notifications } = createManager(async (config) =>
      observer({ name: config.type, status: config.type === 'bad' ? Status.FAILURE : Status.SUCCESS, link: '' })
    );

    await manager.refreshObservers([{ type: 'good' }, { type: 'bad' }]);

    expect(presenter.updateImage).toHaveBeenCalledWith(expect.objectContaining({ status: Status.FAILURE }));
    expect(presenter.updateMenu).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'good', status: Status.SUCCESS }),
      expect.objectContaining({ name: 'bad', status: Status.FAILURE }),
    ]);
    expect(notifications.updateNotifications).toHaveBeenCalled();
    expect(manager.getStates()).toHaveLength(2);
  });

  it('skips observers that cannot be built or refreshed', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('bad config'))
      .mockResolvedValueOnce({ getState: async () => Promise.reject(new Error('network')) } as Observer);
    const { manager, presenter } = createManager(factory);

    await manager.refreshObservers([{ type: 'broken' }, { type: 'offline' }]);

    expect(presenter.updateMenu).toHaveBeenCalledWith([expect.objectContaining({ status: Status.NA })]);
    expect(manager.getStates()).toEqual([{ name: 'Unknown', status: Status.NA, link: '' }]);
  });

  it('refreshes on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const { manager } = createManager(async () => observer({ name: 'build', status: Status.SUCCESS, link: '' }));
    const refresh = vi.spyOn(manager, 'refreshState').mockResolvedValue();

    manager.start(1000);
    await vi.advanceTimersByTimeAsync(3000);
    manager.destroy();

    expect(refresh).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
