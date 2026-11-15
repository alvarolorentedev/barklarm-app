import { Observer } from '../../../types/Observer';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';
import { AzureDevOpsConfiguration } from '../type';
import { fetchWrapper } from '../../fetch-adapter';
import { toBase64 } from '../../base64';

export class AzureDevOps extends Observer {
  private project: string;
  private pipelineId: number;
  private orgUrl: string;
  private authToken: string;

  constructor({ authToken, orgUrl, project, pipelineId, alias, issueEndpoint, muted }: AzureDevOpsConfiguration) {
    super(alias || `Azure DevOps: ${orgUrl}/${project}`, issueEndpoint, muted);
    this.authToken = authToken;
    this.orgUrl = orgUrl;
    this.project = project;
    this.pipelineId = pipelineId;
  }

  public async getState(): Promise<State> {
    try {
      const baseUrl = this.orgUrl.replace(/\/+$/, '');
      const project = encodeURIComponent(this.project);
      const response = await fetchWrapper(
        `${baseUrl}/${project}/_apis/pipelines/${this.pipelineId}/runs?api-version=7.1`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${toBase64(`:${this.authToken}`)}`,
          },
        }
      );
      if (!response.ok) throw new Error('response is invalid');
      const body = await response.json();
      const run = body.value?.[0];
      if (!run) throw new Error('response is invalid');

      const status = this.getStatus(run.state, run.result);
      return {
        name: this.alias,
        status,
        link: run._links.web.href,
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
        link: this.orgUrl,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }

  private getStatus(state: string, result?: string): Status {
    if (state !== 'completed') return Status.CHECKING;
    if (result === 'succeeded') return Status.SUCCESS;
    if (result === 'failed') return Status.FAILURE;
    return Status.NA;
  }
}
