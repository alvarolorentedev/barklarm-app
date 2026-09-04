import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { NewRelicConfiguration } from '../type';
import { Status } from '../../../types/Status';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;

export class NewRelic extends Observer {
  private readonly url: string;
  private readonly site: string;
  private readonly apiKey: string;

  constructor({ site, apiKey, alias, issueEndpoint, muted }: NewRelicConfiguration) {
    super(alias || `New Relic: alerts`, issueEndpoint, muted);
    this.url = `https://api.${site}/v2/alerts_violations.json`;
    this.site = `https://one.${site}/nrai`;
    this.apiKey = apiKey;
  }

  public async getState(): Promise<State> {
    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          'X-Api-Key': `${this.apiKey}`,
        },
      });
      if (!response.ok) throw new Error('response is invalid');
      const body = await response.json();
      const status = body.violations.length === 0 ? Status.SUCCESS : Status.FAILURE;
      return {
        name: this.alias,
        status,
        link: this.site,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: body.violations[0].id,
                description: body.violations[0].condition_name,
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
