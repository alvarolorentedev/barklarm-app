import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { Status } from '../../../types/Status';
import { GraylogConfiguration } from '../type';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;

export class Graylog extends Observer {
  private readonly url: string;
  private readonly site: string;
  private readonly username: string;
  private readonly password: string;

  constructor({ url, alias, username, password, streamId, issueEndpoint, muted }: GraylogConfiguration) {
    super(alias || `Graylog: ${url}`, issueEndpoint, muted);
    this.url = `${url}/api/streams${streamId ? `/${streamId}` : ''}/alerts/paginated?skip=0&limit=5&state=unresolved`;
    this.site = `${url}/alerts${streamId ? `/${streamId}` : ''}`;
    this.username = username;
    this.password = password;
  }
  public async getState(): Promise<State> {
    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(this.username + ':' + this.password)}`,
        },
      });
      if (!response.ok) throw new Error('response is invalid');
      const alertRules = await response.json();
      const status = alertRules.total > 0 ? Status.FAILURE : Status.SUCCESS;
      return {
        name: this.alias,
        status,
        link: this.site,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                description: alertRules.alerts[0].description,
                id: alertRules.alerts[0].id,
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
}
