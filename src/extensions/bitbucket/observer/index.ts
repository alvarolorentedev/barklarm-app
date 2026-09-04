import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { Status } from '../../../types/Status';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;
import { BitbucketConfiguration } from '../type';

export class Bitbucket extends Observer {
  private readonly apiUrl: string;
  private readonly pipelinesUrl: string;
  private readonly branch: string;
  private readonly authToken: string;

  constructor({ workspace, repo, branch, authToken, alias, issueEndpoint, muted }: BitbucketConfiguration) {
    super(alias || `Bitbucket: ${repo}/${branch}`, issueEndpoint, muted);
    this.apiUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pipelines?target.ref_name=${branch}&sort=-created_on`;
    this.pipelinesUrl = `https://bitbucket.org/${workspace}/${repo}/pipelines/results`;
    this.authToken = authToken;
    this.branch = branch;
  }
  public async getState(): Promise<State> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });
      if (!response.ok) throw new Error('response is invalid');
      const pipelines = await response.json();
      const lastPipeline = pipelines.values[0];
      const status = this.getStatusFromPipelineResult(lastPipeline.state.name, lastPipeline.state.result?.name);
      return {
        name: this.alias,
        status,
        link: `${this.pipelinesUrl}/${lastPipeline.build_number}`,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: lastPipeline.uuid,
                description: `Pipeline Failed`,
              }
            : undefined,
      };
    } catch (_) {
      return {
        name: this.alias,
        status: Status.NA,
        link: `${this.pipelinesUrl}/branch/${this.branch}/page/1`,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }

  private getStatusFromPipelineResult(state: string, result?: string): Status {
    return state !== BitbucketState.COMPLETED
      ? Status.CHECKING
      : result === BitbucketResult.SUCCESSFUL
        ? Status.SUCCESS
        : result === BitbucketResult.FAILED || BitbucketResult.ERROR
          ? Status.FAILURE
          : Status.NA;
  }
}

enum BitbucketState {
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
}

enum BitbucketResult {
  FAILED = 'FAILED',
  SUCCESSFUL = 'SUCCESSFUL',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR',
}
