import { MapType } from '../types/MapType';

export const observersList: MapType<any> = [
  { value: 'githubAction', label: 'GitHub Actions' },
  { value: 'azureDevOps', label: 'Azure DevOps' },
  { value: 'bitbucket', label: 'Bitbucket Pipelines' },
  { value: 'ccTray', label: 'CCTray' },
  { value: 'datadogMonitor', label: 'Datadog Monitor' },
  { value: 'sentry', label: 'Sentry' },
  { value: 'newRelic', label: 'New Relic' },
  { value: 'opsgenie', label: 'Opsgenie' },
  { value: 'graylog', label: 'Graylog' },
  { value: 'grafana', label: 'Grafana (Alpha)' },
];
