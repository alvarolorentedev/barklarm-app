import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../types/Status';
import { Observer } from '../types/Observer';
import { State } from '../types/State';
import { ObserverManager } from './observer-manager';

function observer(state: State): Observer {
  return { getState: async () => state } as Observer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

    await manager.refreshObservers([
      { id: 'good', type: 'good' },
      { id: 'bad', type: 'bad' },
    ]);

    expect(presenter.updateImage).toHaveBeenCalledWith(expect.objectContaining({ status: Status.FAILURE }));
    expect(presenter.updateMenu).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'good', name: 'good', status: Status.SUCCESS }),
      expect.objectContaining({ id: 'bad', name: 'bad', status: Status.FAILURE }),
    ]);
    expect(notifications.updateNotifications).toHaveBeenCalled();
    expect(manager.getStates()).toHaveLength(2);
  });

  it('stamps the stable configuration ID on every state', async () => {
    const { manager } = createManager(async (config) =>
      observer({ name: config.type, status: Status.SUCCESS, link: '' })
    );

    await manager.refreshObservers([{ id: 'legacy-1', type: 'legacy' }]);
    const [state] = manager.getStates();

    expect(state.id).toBe('legacy-1');
  });

  it('skips observers that cannot be built or refreshed', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('bad config'))
      .mockResolvedValueOnce({ getState: async () => Promise.reject(new Error('network')) } as Observer);
    const { manager, presenter } = createManager(factory);

    await manager.refreshObservers([{ type: 'broken' }, { type: 'offline' }]);

    expect(presenter.updateMenu).toHaveBeenCalledWith([expect.objectContaining({ status: Status.NA })]);
    expect(manager.getStates()).toEqual([expect.objectContaining({ name: 'Unknown', status: Status.NA })]);
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

  it('does not start a second refresh while one is in flight', async () => {
    const gate = deferred<State>();
    const getState = vi.fn(() => gate.promise);
    const { manager } = createManager(async () => ({ getState }) as unknown as Observer);

    await manager.setConfigs([{ id: 'build', type: 'build' }]);
    const first = manager.refreshState();
    const second = manager.refreshState();

    expect(getState).toHaveBeenCalledTimes(1);

    gate.resolve({ name: 'build', status: Status.SUCCESS, link: '' });
    await Promise.all([first, second]);

    expect(manager.getStates()).toEqual([expect.objectContaining({ id: 'build', status: Status.SUCCESS })]);
  });

  it('skips interval ticks while a refresh is still running', async () => {
    vi.useFakeTimers();
    const gate = deferred<State>();
    const getState = vi.fn(() => gate.promise);
    const { manager } = createManager(async () => ({ getState }) as unknown as Observer);

    await manager.setConfigs([{ id: 'slow', type: 'slow' }]);
    manager.start(1000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(getState).toHaveBeenCalledTimes(1);

    gate.resolve({ name: 'slow', status: Status.SUCCESS, link: '' });
    await vi.advanceTimersByTimeAsync(0);
    manager.destroy();
    vi.useRealTimers();
  });

  it('discards results from a configuration that changed mid-refresh', async () => {
    const oldGate = deferred<State>();
    const factory = vi.fn(async (config: any) => {
      if (config.type === 'old') return { getState: () => oldGate.promise } as Observer;
      return observer({ name: 'new', status: Status.SUCCESS, link: '' });
    });
    const { manager, presenter } = createManager(factory);

    await manager.setConfigs([{ id: 'old', type: 'old' }]);
    const oldRefresh = manager.refreshState();
    const configChange = manager.refreshObservers([{ id: 'new', type: 'new' }]);

    oldGate.resolve({ name: 'old', status: Status.FAILURE, link: '' });
    await oldRefresh;
    await configChange;

    expect(presenter.updateMenu).not.toHaveBeenCalledWith([expect.objectContaining({ id: 'old' })]);
    expect(presenter.updateMenu).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'new', status: Status.SUCCESS }),
    ]);
  });
});
