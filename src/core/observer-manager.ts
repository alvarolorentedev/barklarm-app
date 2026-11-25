import { Observer } from '../types/Observer';
import { ObserverConfiguration } from '../types/ObserverConfiguration';
import { State } from '../types/State';
import { Status } from '../types/Status';
import { ObserversBuildersMap } from '../extensions/observerBuiderMap';
import { normalizeObservables } from './config';
import { NotificationManager } from './notification';

export interface ObserverPresenter {
  updateImage(state: State): void;
  updateMenu(states: State[]): void;
}

export type ObserverFactory = (config: ObserverConfiguration) => Promise<Observer | undefined>;

type ObserverEntry = {
  config: ObserverConfiguration;
  observer: Observer;
};

async function defaultFactory(config: ObserverConfiguration): Promise<Observer | undefined> {
  const build = ObserversBuildersMap[config.type];
  return build ? build(config) : undefined;
}

export class ObserverManager {
  private entries: ObserverEntry[] = [];
  private observersState: State[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private generation = 0;

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
    const generation = ++this.generation;
    const normalized = normalizeObservables(configs);
    const entries = await Promise.all(
      normalized.map(async (config) => {
        try {
          const observer = await this.factory(config);
          return observer ? { config, observer } : undefined;
        } catch (error) {
          console.error(error);
          return undefined;
        }
      })
    );
    // A newer configuration was applied while observers were being built.
    if (generation !== this.generation) return;
    this.entries = entries.filter(Boolean) as ObserverEntry[];
  }

  async refreshObservers(configs: ObserverConfiguration[]): Promise<void> {
    await this.setConfigs(configs);
    if (this.inFlight) await this.inFlight.catch(() => undefined);
    await this.refreshState();
  }

  /**
   * Coalesces concurrent refreshes. Interval ticks that arrive while a refresh
   * is running are skipped instead of queued, so a slow source cannot build up
   * a backlog. Explicit config changes wait for the current run first.
   */
  refreshState(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    return this.runRefresh();
  }

  private async runRefresh(): Promise<void> {
    const generation = this.generation;
    const entries = [...this.entries];
    const task = (async () => {
      const states = await Promise.all(
        entries.map(async ({ config, observer }) => {
          try {
            const state = await observer.getState();
            return { ...state, id: config.id };
          } catch (error) {
            console.error(error);
            return { id: config.id, name: config.alias || 'Unknown', status: Status.NA, link: '' };
          }
        })
      );
      // Discard results collected for a configuration that has since changed.
      if (generation !== this.generation) return;

      const oldStates = [...this.observersState];
      this.observersState = states;
      const globalState: State = {
        name: 'Global',
        status: this.calculateGlobalStatus(this.observersState),
        link: '',
      };

      this.notifications.updateNotifications(oldStates, this.observersState);
      this.presenter.updateImage(globalState);
      this.presenter.updateMenu(this.observersState);
    })();

    this.inFlight = task;
    try {
      await task;
    } finally {
      if (this.inFlight === task) this.inFlight = null;
    }
  }

  getStates(): State[] {
    return this.observersState.map((state) => ({ ...state }));
  }

  start(refreshInterval: number): void {
    this.stop();
    this.intervalId = setInterval(() => {
      void this.refreshState().catch((error) => console.error('Observer refresh failed:', error));
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
