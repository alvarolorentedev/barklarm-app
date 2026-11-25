import { Observer } from '../types/Observer';
import { ObserverConfiguration } from '../types/ObserverConfiguration';
import { State } from '../types/State';
import { Status } from '../types/Status';
import { ObserversBuildersMap } from '../extensions/observerBuiderMap';
import { normalizeObservables } from './config';
import { DiagnosticObserverSource, EvidenceManager } from './diagnostics/evidence-manager';
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

function diagnosticSource(config: ObserverConfiguration, observer: Observer): DiagnosticObserverSource | undefined {
  if (!config.id) return undefined;
  try {
    return {
      id: config.id,
      config,
      provider: observer.getDiagnosticProvider?.(),
      scope: observer.getDiagnosticScope?.(),
    };
  } catch {
    // A broken optional capability must not break monitoring, and the error
    // could contain configuration; log no details.
    console.error('Failed to initialize diagnostics for one observer.');
    return { id: config.id, config };
  }
}

export class ObserverManager {
  private entries: ObserverEntry[] = [];
  private observersState: State[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private generation = 0;
  private configBuilds = 0;

  constructor(
    private readonly presenter: ObserverPresenter,
    private readonly notifications: NotificationManager,
    private readonly factory: ObserverFactory = defaultFactory,
    private readonly evidence?: EvidenceManager
  ) {}

  private calculateGlobalStatus(states: State[]): Status {
    if (states.some((s) => s.status === Status.FAILURE)) return Status.FAILURE;
    if (states.some((s) => s.status === Status.NA)) return Status.NA;
    if (states.some((s) => s.status === Status.CHECKING)) return Status.CHECKING;
    return Status.SUCCESS;
  }

  async setConfigs(configs: ObserverConfiguration[]): Promise<void> {
    const generation = ++this.generation;
    this.configBuilds += 1;
    try {
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
      try {
        this.evidence?.setObservers(
          this.entries
            .map(({ config, observer }) => diagnosticSource(config, observer))
            .filter((source): source is DiagnosticObserverSource => !!source)
        );
      } catch {
        console.error('Failed to configure diagnostics for an observer.');
      }
      // Invalidate refreshes that started with the previous entries while the
      // replacement observers were still being built.
      this.generation += 1;
    } finally {
      this.configBuilds -= 1;
    }
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
    if (this.configBuilds > 0) return Promise.resolve();
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
      try {
        // Scheduling is synchronous and the provider work is detached, so a slow
        // diagnostic source never delays polling, notifications or the tray.
        this.evidence?.observe(this.observersState);
      } catch {
        console.error('Failed to schedule diagnostics.');
      }
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
    this.evidence?.shutdown();
  }
}
