import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { SentryConfiguration } from '../type';
import { Status } from '../../../types/Status';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;

export class Sentry extends Observer {
  private readonly url: string;
  private readonly site: string;
  private readonly authToken: string;

  constructor({ organization, project, authToken, alias, issueEndpoint, muted }: SentryConfiguration) {
    super(alias || `Sentry: ${organization}/${project}`, issueEndpoint, muted);
    this.url = `https://sentry.io/api/0/projects/${organization}/${project}/issues/`;
    this.site = `https://sentry.io/organizations/${organization}/projects/${project}`;
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
      const body = await response.json();
      const status = body.length === 0 ? Status.SUCCESS : Status.FAILURE;
      return {
        name: this.alias,
        status,
        link: this.site,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: body[0].id,
                description: body[0].title,
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
