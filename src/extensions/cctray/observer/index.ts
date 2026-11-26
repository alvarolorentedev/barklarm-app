import { State } from '../../../types/State';
import { Observer } from '../../../types/Observer';
import { CCTrayConfiguration } from '../type';
import { Status } from '../../../types/Status';
import { XMLParser } from 'fast-xml-parser';
import { fetchWrapper } from '../../fetch-adapter';
const fetch = fetchWrapper;

const WORST_FIRST = [Status.FAILURE, Status.NA, Status.CHECKING, Status.SUCCESS];

export class CCTray extends Observer {
  private readonly url: string;
  private readonly projectName: string;
  private readonly parser: XMLParser;
  private readonly statusMap: any = {
    Success: Status.SUCCESS,
    Failure: Status.FAILURE,
    Exception: Status.FAILURE,
    Unknown: Status.NA,
  };

  constructor({ url, alias, name, issueEndpoint, muted }: CCTrayConfiguration) {
    super(alias || `CCTray: ${name || url}`, issueEndpoint, muted);
    this.url = url;
    this.projectName = name;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      allowBooleanAttributes: true,
    });
  }

  /** Empty pattern matches every project; `*` matches any run of characters. */
  private getProjects(projects: any | any[], projectName?: string): any[] {
    const projectsList = (Array.isArray(projects) ? projects : [projects]).filter(Boolean);
    if (!projectName) return projectsList;
    const pattern = new RegExp(`^${projectName.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*+/g, '.*')}$`);
    return projectsList.filter((project) => pattern.test(project.name));
  }

  public async getState(): Promise<State> {
    try {
      const response = await fetch(this.url, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('response is invalid');
      const projects = this.parser.parse(await response.text()).Projects;
      const ranked = this.getProjects(projects.Project, this.projectName)
        .map((project) => ({ project, status: this.getStatus(project.activity, project.lastBuildStatus) }))
        .sort((a, b) => WORST_FIRST.indexOf(a.status) - WORST_FIRST.indexOf(b.status));
      if (ranked.length === 0) throw new Error('no matching project');
      const failedProjects = ranked.filter(({ status }) => status === Status.FAILURE).map(({ project }) => project);
      const { project, status } = ranked[0];
      return {
        name: this.alias,
        status,
        link: project.webUrl,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
        error:
          status === Status.FAILURE
            ? {
                // The failure set is the event (ADR 0004), so a new failure notifies even while the aggregate stays red.
                id: failedProjects.map(({ name, lastBuildTime }) => `${name}_${lastBuildTime}`).join(', '),
                description: `${failedProjects.map(({ name }) => name).join(', ')} Build Failed`,
              }
            : undefined,
      };
    } catch (_) {
      return {
        name: this.alias,
        status: Status.NA,
        link: this.url,
        muted: this.muted,
        issueEndpoint: this.issueEndpoint,
      };
    }
  }
  private getStatus(activity: string, lastBuildStatus: string): Status {
    return activity !== 'Sleeping' ? Status.CHECKING : (this.statusMap[lastBuildStatus] ?? Status.NA);
  }
}
