import { MapType } from '../types/MapType';

export const observersTitleBuilderMap: MapType<(observable: any) => string> = {
  githubAction: (observable: any) =>
    `GitHub: ${observable.alias || `${observable.owner}/${observable.repo}/${observable.workflowId}`}`,
  ccTray: (observable: any) => `CCTray: ${observable.alias || observable.name || observable.url}`,
  datadogMonitor: (observable: any) => `Datadog: ${observable.alias || `${observable.site}/${observable.monitorId}`}`,
  sentry: (observable: any) => `Sentry: ${observable.alias || `${observable.organization}/${observable.project}`}`,
  newRelic: (observable: any) => `NewRelic: ${observable.alias || `alerts`}`,
  grafana: (observable: any) => `Grafana: ${observable.alias || observable.url}`,
  azureDevOps: (observable: any) =>
    `Azure DevOps: ${observable.alias || `${observable.project}/${observable.pipelineId}`}`,
  opsgenie: (observable: any) => `Opsgenie: ${observable.alias || `${observable.host}/${observable.identifier}`}`,
  bitbucket: (observable: any) =>
    `Bitbucket: ${observable.alias || `${observable.workspace}/${observable.repo}/${observable.branch}`}`,
  graylog: (observable: any) => `Graylog: ${observable.alias || observable.url}`,
};
