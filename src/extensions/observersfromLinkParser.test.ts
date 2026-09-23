import { observersfromLinkParser } from './observersfromLinkParser';
import { expect, describe, it } from 'vitest';

describe('observersfromLinkParser', () => {
  describe.each([
    [
      'https://github.com/alvarolorentedev/barklarm-app/actions/workflows/build.yml',
      {
        type: 'githubAction',
        owner: 'barklarm',
        repo: 'barklarm-app',
        workflowId: 'build.yml',
      },
    ],
    [
      'https://api.travis-ci.com/repos/kanekotic/web-threads/cc.xml?branch=master',
      {
        type: 'ccTray',
        url: 'https://api.travis-ci.com/repos/kanekotic/web-threads/cc.xml?branch=master',
      },
    ],
    [
      'https://app.datadoghq.eu/monitors/4005341',
      {
        type: 'datadogMonitor',
        site: 'datadoghq.eu',
        monitorId: '4005341',
      },
    ],
    [
      'https://sentry.io/organizations/climatepartner/projects/website/',
      {
        type: 'sentry',
        organization: 'climatepartner',
        project: 'website',
      },
    ],
    [
      'https://orgname.visualstudio.com/projectname/_build?definitionId=11111',
      {
        type: 'azureDevOps',
        orgUrl: 'https://orgname.visualstudio.com',
        pipelineId: '11111',
        project: 'projectname',
      },
    ],
    [
      'https://some.app.eu.opsgenie.com/alert/detail/15ccd687fb8d-1724415135067/details',
      {
        type: 'opsgenie',
        host: 'eu.opsgenie.com',
        identifier: '15ccd687fb8d-1724415135067',
      },
    ],
    [
      'https://graylog.cloudtest/alerts',
      {
        type: 'graylog',
        url: 'https://graylog.cloudtest',
      },
    ],
  ])('%s parsed', (url: string, expectedParse: any) => {
    it('should have correct textfield attributes', () => {
      const result = observersfromLinkParser
        .map((strategy) => {
          if (strategy.canApply(url))
            return {
              canApply: true,
              apply: strategy.apply(url),
            };
          return {
            canApply: false,
          };
        })
        .filter((result) => result.canApply)[0];

      expect(result.canApply).toBeTruthy();
      expect(result.apply).toEqual(expectedParse);
    });
  });
});
