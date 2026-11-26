import { observersTitleBuilderMap } from './observersTitleBuilderMap';
import { expect, describe, it } from 'vitest';

describe('observersComponentBuilderMap', () => {
  describe.each([
    ['githubAction', { alias: 'awesome alias' }, 'GitHub: awesome alias'],
    ['githubAction', { owner: 'owner', repo: 'repo', workflowId: 'workflowId' }, 'GitHub: owner/repo/workflowId'],
    ['ccTray', { alias: 'awesome alias' }, 'CCTray: awesome alias'],
    ['ccTray', { name: 'awesome name' }, 'CCTray: awesome name'],
    ['ccTray', { url: 'awesome url' }, 'CCTray: awesome url'],
    ['datadogMonitor', { alias: 'awesome alias' }, 'Datadog: awesome alias'],
    ['datadogMonitor', { site: 'site', monitorId: 'monitorId' }, 'Datadog: site/monitorId'],
    ['sentry', { alias: 'awesome alias' }, 'Sentry: awesome alias'],
    ['sentry', { organization: 'organization', project: 'project' }, 'Sentry: organization/project'],
    ['newRelic', {}, 'NewRelic: alerts'],
    ['newRelic', { alias: 'awesome alias' }, 'NewRelic: awesome alias'],
    ['azureDevOps', { project: 'project', pipelineId: 'pipelineId' }, 'Azure DevOps: project/pipelineId'],
    ['azureDevOps', { alias: 'awesome alias' }, 'Azure DevOps: awesome alias'],
    ['opsgenie', { host: 'host', identifier: 'id' }, 'Opsgenie: host/id'],
    ['opsgenie', { alias: 'awesome alias' }, 'Opsgenie: awesome alias'],
    ['bitbucket', { workspace: 'workspace', repo: 'repo', branch: 'branch' }, 'Bitbucket: workspace/repo/branch'],
    ['bitbucket', { alias: 'awesome alias' }, 'Bitbucket: awesome alias'],
    ['graylog', { url: 'awesome url' }, 'Graylog: awesome url'],
    ['graylog', { alias: 'awesome alias' }, 'Graylog: awesome alias'],
  ])('%s with %s should return %s', (type: string, observable: any, expected: string) => {
    it('should have correct textfield attributes', () => {
      const result = observersTitleBuilderMap[type](observable);
      expect(result).toEqual(expected);
    });
  });
});
