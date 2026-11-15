import { Observer } from '../../../types/Observer';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';
import { OpsgenieConfiguration } from '../type';
import { fetchWrapper } from '../../fetch-adapter';

export class Opsgenie extends Observer {
  private host: string;
  private identifier: string;
  private apiKey: string;

  constructor({ apiKey, host, identifier, alias, issueEndpoint, muted }: OpsgenieConfiguration) {
    super(alias || `Opsgenie: ${host}/${identifier}`, issueEndpoint, muted);
    this.host = host;
    this.identifier = identifier;
    this.apiKey = apiKey;
  }

  public async getState(): Promise<State> {
    const link = `https://app.${this.host}/alert/detail/${this.identifier}/details`;
    try {
      const response = await fetchWrapper(
        `https://api.${this.host}/v2/alerts/${encodeURIComponent(this.identifier)}?identifierType=id`,
        {
          method: 'GET',
          headers: {
            Authorization: `GenieKey ${this.apiKey}`,
          },
        }
      );
      if (!response.ok) throw new Error('response is invalid');
      const body = await response.json();
      const alert = body.data;
      const status = alert.status === 'open' ? Status.FAILURE : Status.SUCCESS;
      return {
        name: this.alias,
        status,
        link,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: alert.id,
                description: alert.message,
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
