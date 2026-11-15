import { MapType } from '../types/MapType';
import { Observer } from '../types/Observer';
import { AzureDevOps } from './azureDevOps/observer';
import { Bitbucket } from './bitbucket/observer';
import { CCTray } from './cctray/observer';
import { DatadogMonitor } from './datadog/observer';
import { GithubAction } from './github/observer';
import { Grafana } from './grafana/observer';
import { Graylog } from './graylog/observer';
import { NewRelic } from './newRelic/observer';
import { Opsgenie } from './opsgenie/observer';
import { Sentry } from './sentry/observer';

type ObserverBuilder = (config: any) => Promise<Observer>;

export const ObserversBuildersMap: MapType<ObserverBuilder> = {
  githubAction: async (configuration: any) => new GithubAction(configuration),
  ccTray: async (configuration: any) => new CCTray(configuration),
  datadogMonitor: async (configuration: any) => new DatadogMonitor(configuration),
  sentry: async (configuration: any) => new Sentry(configuration),
  newRelic: async (configuration: any) => new NewRelic(configuration),
  grafana: async (configuration: any) => new Grafana(configuration),
  azureDevOps: async (configuration: any) => new AzureDevOps(configuration),
  opsgenie: async (configuration: any) => new Opsgenie(configuration),
  bitbucket: async (configuration: any) => new Bitbucket(configuration),
  graylog: async (configuration: any) => new Graylog(configuration),
};
