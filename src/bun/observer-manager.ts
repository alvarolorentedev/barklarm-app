import { store } from './store';
import { TrayManager } from './tray';
import { NotificationManager } from './notification';
import { State } from '../types/State';
import { Observer } from '../types/Observer';
import { ObserverConfiguration } from '../types/ObserverConfiguration';
import { Status } from '../types/Status';
import { ObserversBuildersMap } from '../extensions/observerBuiderMap';

export class ObserverManager {
  private observers: Observer[] = [];
  private observersState: State[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private tray: TrayManager,
    private notifications: NotificationManager,
    enableRefresh = true,
    refreshInterval = 60000
  ) {
    if (enableRefresh) {
      this.intervalId = setInterval(() => this.refreshState(), refreshInterval);
    }
  }

  private calculateGlobalStatus(states: State[]): Status {
    if (states.some((s) => s.status === Status.FAILURE)) return Status.FAILURE;
    if (states.some((s) => s.status === Status.NA)) return Status.NA;
    if (states.some((s) => s.status === Status.CHECKING)) return Status.CHECKING;
    return Status.SUCCESS;
  }

  async refreshState(): Promise<void> {
    const oldStates = this.observersState.length > 0 ? [...this.observersState] : [];
    this.observersState = await Promise.all(this.observers.map((o) => o.getState()));
    const globalState: State = {
      name: 'Global',
      status: this.calculateGlobalStatus(this.observersState),
      link: '',
    };

    this.notifications.updateNotifications(oldStates, this.observersState);
    this.tray.updateImage(globalState);
    this.tray.updateMenu(this.observersState);
  }

  refreshObservers(): void {
    const configs = (store.get('observables') || []) as ObserverConfiguration[];
    this.observers = configs
      .map((config) => {
        try {
          return ObserversBuildersMap[config.type]?.(config);
        } catch (error) {
          console.error(error);
          return undefined;
        }
      })
      .filter(Boolean) as Observer[];
    this.refreshState();
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
