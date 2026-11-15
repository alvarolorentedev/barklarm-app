import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { DetadogMonitorConfiguration } from '../type';
import { Status } from '../../../types/Status';
import { fetchWrapper } from '../../fetch-adapter';

const OVERALL_STATE_MAP: Record<string, Status> = {
  OK: Status.SUCCESS,
  Alert: Status.FAILURE,
  Warn: Status.FAILURE,
  Ignored: Status.NA,
  'No Data': Status.NA,
  Skipped: Status.NA,
  Unknown: Status.NA,
};

export class DatadogMonitor extends Observer {
  private readonly site: string;
  private readonly monitorId: number;
  private readonly apiKey: string;
  private readonly appKey: string;

  constructor({ alias, site, apiKey, appKey, monitorId, issueEndpoint, muted }: DetadogMonitorConfiguration) {
    super(alias || `Datadog: ${monitorId}`, issueEndpoint, muted);
    this.site = site;
    this.monitorId = monitorId;
    this.apiKey = apiKey;
    this.appKey = appKey;
  }

  public async getState(): Promise<State> {
    const link = `https://app.${this.site}/monitors/${this.monitorId}`;
    try {
      const response = await fetchWrapper(`https://api.${this.site}/api/v1/monitor/${this.monitorId}`, {
        method: 'GET',
        headers: {
          'DD-API-KEY': this.apiKey,
          'DD-APPLICATION-KEY': this.appKey,
        },
      });
      if (!response.ok) throw new Error('response is invalid');
      const data = await response.json();
      const state = String(data.overall_state);
      const status = OVERALL_STATE_MAP[state] ?? OVERALL_STATE_MAP[state.toUpperCase()] ?? Status.NA;
      return {
        name: this.alias,
        status,
        link,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: data.id.toString(),
                description: data.message,
              }
            : undefined,
      };
    } catch (error) {
      console.error(error);
      return {
        name: this.alias,
        status: Status.NA,
        link,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }
}
