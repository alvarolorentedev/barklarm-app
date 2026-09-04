import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { Status } from '../../../types/Status';
import { GrafanaConfiguration } from '../type';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;

export class Grafana extends Observer {
  private readonly url: string;
  private readonly site: string;
  private readonly authToken: string;

  constructor({ url, alias, authToken, issueEndpoint, muted }: GrafanaConfiguration) {
    super(alias || `Grafana: ${url}`, issueEndpoint, muted);
    this.url = `${url}/api/v1/provisioning/alert-rules`;
    this.site = `${url}/alerting`;
    this.authToken = authToken;
  }
  public async getState(): Promise<State> {
    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (!response.ok) throw new Error('response is invalid');
      const alertRules = await response.json();
      const status = this.getStatus(alertRules);
      return {
        name: this.alias,
        status,
        link: this.site,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: alertRules[0].uid,
                description: alertRules[0].title,
              }
            : undefined,
      };
    } catch (_) {
      return {
        name: this.alias,
        status: Status.NA,
        link: this.site,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }

  private getStatus(alertRules: any[]): Status {
    return alertRules.some((alertRule: any) => alertRule.execErrState === 'Error') ? Status.FAILURE : Status.SUCCESS;
  }
}
