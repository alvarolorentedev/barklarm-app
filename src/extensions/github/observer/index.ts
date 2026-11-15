import { Observer } from '../../../types/Observer';
import { State } from '../../../types/State';
import { GithubActionConfiguration } from '../type';
import { Status } from '../../../types/Status';
import { fetchWrapper } from '../../fetch-adapter';

export class GithubAction extends Observer {
  private owner: string;
  private repo: string;
  private workflowId: string;
  private authToken: string;
  private baseLink: string;

  constructor({ authToken, owner, repo, workflowId, alias, issueEndpoint, muted }: GithubActionConfiguration) {
    super(alias || `Github: ${owner}/${repo}/${workflowId}`, issueEndpoint, muted);
    this.authToken = authToken;
    this.owner = owner;
    this.repo = repo;
    this.workflowId = workflowId;
    this.baseLink = `https://github.com/${owner}/${repo}/actions/`;
  }

  public async getState(): Promise<State> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;

      const response = await fetchWrapper(
        `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${this.workflowId}/runs?per_page=1`,
        { method: 'GET', headers }
      );
      if (!response.ok) throw new Error('response is invalid');
      const data = await response.json();
      if (data.total_count === 0) throw new Error('response is invalid');
      const run = data.workflow_runs[0];
      const status = this.getStatus(run.conclusion);

      return {
        name: this.alias,
        status,
        link: run.html_url,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                id: run.id.toString(),
                description: `${run.name} Workflow Failed`,
              }
            : undefined,
      };
    } catch (error) {
      console.error(error);
      return {
        name: this.alias,
        status: Status.NA,
        link: this.baseLink,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }

  private getStatus(conclusion: string | null): Status {
    return conclusion == null ? Status.CHECKING : conclusion === 'success' ? Status.SUCCESS : Status.FAILURE;
  }
}
