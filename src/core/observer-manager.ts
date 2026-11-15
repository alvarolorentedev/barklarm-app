import { Observer } from '../types/Observer';
import { ObserverConfiguration } from '../types/ObserverConfiguration';
import { State } from '../types/State';
import { Status } from '../types/Status';
import { ObserversBuildersMap } from '../extensions/observerBuiderMap';
import { NotificationManager } from './notification';

export interface ObserverPresenter {
  updateImage(state: State): void;
  updateMenu(states: State[]): void;
}

export type ObserverFactory = (config: ObserverConfiguration) => Promise<Observer | undefined>;

async function defaultFactory(config: ObserverConfiguration): Promise<Observer | undefined> {
  const build = ObserversBuildersMap[config.type];
  return build ? build(config) : undefined;
}

export class ObserverManager {
  private observers: Observer[] = [];
  private observersState: State[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly presenter: ObserverPresenter,
    private readonly notifications: NotificationManager,
    private readonly factory: ObserverFactory = defaultFactory
  ) {}

  private calculateGlobalStatus(states: State[]): Status {
    if (states.some((s) => s.status === Status.FAILURE)) return Status.FAILURE;
    if (states.some((s) => s.status === Status.NA)) return Status.NA;
    if (states.some((s) => s.status === Status.CHECKING)) return Status.CHECKING;
    return Status.SUCCESS;
  }

  async setConfigs(configs: ObserverConfiguration[]): Promise<void> {
    const observers = await Promise.all(
      configs.map(async (config) => {
        try {
          return await this.factory(config);
        } catch (error) {
          console.error(error);
          return undefined;
        }
      })
    );
    this.observers = observers.filter(Boolean) as Observer[];
  }

  async refreshObservers(configs: ObserverConfiguration[]): Promise<void> {
    await this.setConfigs(configs);
    await this.refreshState();
  }

  async refreshState(): Promise<void> {
    const oldStates = this.observersState.length > 0 ? [...this.observersState] : [];
    this.observersState = await Promise.all(
      this.observers.map(async (observer) => {
        try {
          return await observer.getState();
        } catch (error) {
          console.error(error);
          return { name: 'Unknown', status: Status.NA, link: '' };
        }
      })
    );
    const globalState: State = {
      name: 'Global',
      status: this.calculateGlobalStatus(this.observersState),
      link: '',
    };

    this.notifications.updateNotifications(oldStates, this.observersState);
    this.presenter.updateImage(globalState);
    this.presenter.updateMenu(this.observersState);
  }

  getStates(): State[] {
    return this.observersState.map((state) => ({ ...state }));
  }

  start(refreshInterval: number): void {
    this.stop();
    this.intervalId = setInterval(() => {
      void this.refreshState();
    }, refreshInterval);
  }

  setRefreshInterval(refreshInterval: number): void {
    if (this.intervalId) this.start(refreshInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy(): void {
    this.stop();
  }
}
