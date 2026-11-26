import { CCTray } from './';
import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { CCTrayConfiguration } from '../type';
import { expect, describe, it, vi, beforeEach } from 'vitest';

const fetchtMock = vi.fn();
vi.mock('../../fetch-adapter', () => {
  return {
    __esModule: true,
    fetchWrapper: (...all: any) => fetchtMock(...all),
  };
});

const projectXml = (
  name: string,
  lastBuildStatus: string,
  {
    activity = 'Sleeping',
    webUrl = 'https://ci.example.test/build',
    lastBuildTime = '2005-09-28T10:30:34.6362160+01:00',
  }: { activity?: string; webUrl?: string; lastBuildTime?: string } = {}
) =>
  `<Project name="${name}" activity="${activity}" lastBuildStatus="${lastBuildStatus}" lastBuildLabel="8" lastBuildTime="${lastBuildTime}" nextBuildTime="2005-10-04T14:31:52.4509248+01:00" webUrl="${webUrl}"/>`;

const projectsXml = (...projects: string[]) => `<Projects>${projects.join('')}</Projects>`;

describe('CCTray', () => {
  describe('getState', () => {
    let config: CCTrayConfiguration;
    let observer: CCTray;

    beforeEach(() => {
      fetchtMock.mockClear();
      config = {
        type: 'ccTray',
        url: faker.internet.url(),
        alias: faker.lorem.word(),
        name: 'selected-test',
      };
      observer = new CCTray(config);
    });

    it('shoulds return NA status if request return diferent value than 200', async () => {
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve('kaboom'),
        ok: false,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.NA,
        link: config.url,
      });
    });

    it('shoulds return NA status if request return xml with last build status unkown and activity equal to Sleeping', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="Sleeping"
                lastBuildStatus="Unknown"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.NA,
        link: expectUrl,
      });
    });

    it('shoulds return NA status if request return xml with no matching name', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="non-selected-test"
                activity="Sleeping"
                lastBuildStatus="Success"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.NA,
        link: config.url,
      });
    });

    it('shoulds return CHECKING status if request return xml with activity equal to Building', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="Building"
                lastBuildStatus="Unknown"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.CHECKING,
        link: expectUrl,
      });
    });

    it('shoulds return CHECKING status if request return xml with activity equal to CheckingModifications', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="CheckingModifications"
                lastBuildStatus="Unknown"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.CHECKING,
        link: expectUrl,
      });
    });

    it('shoulds return SUCCESS status if request return xml with last build status Success and activity equal to Sleeping', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="Sleeping"
                lastBuildStatus="Success"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.SUCCESS,
        link: expectUrl,
      });
    });
    it('shoulds return Failure status if request return xml with last build status Failure and activity equal to Sleeping', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="Sleeping"
                lastBuildStatus="Failure"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: expectUrl,
        error: {
          description: 'selected-test Build Failed',
          id: 'selected-test_2005-09-28T10:30:34.6362160+01:00',
        },
      });
    });
    it('shoulds return Failure status if request return xml with last build status Exception and activity equal to Sleeping', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="selected-test"
                activity="Sleeping"
                lastBuildStatus="Exception"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: expectUrl,
        error: {
          description: 'selected-test Build Failed',
          id: 'selected-test_2005-09-28T10:30:34.6362160+01:00',
        },
      });
    });

    it('shoulds return SUCCESS status if request return xml with matching name last build status Success and activity equal to Sleeping', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="unselected-test-1"
                activity="Sleeping"
                lastBuildStatus="Failure"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="http://randomurl.com"/>
            <Project
                name="selected-test"
                activity="Sleeping"
                lastBuildStatus="Success"
                lastBuildLabel="8"
                lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
                nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
                webUrl="${expectUrl}"/>
            <Project
            name="unselected-test-2"
            activity="Sleeping"
            lastBuildStatus="Failure"
            lastBuildLabel="8"
            lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
            nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
            webUrl=""/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(config.url, {
        method: 'GET',
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.SUCCESS,
        link: expectUrl,
      });
    });

    it('should aggregate every project when no project is specified', async () => {
      const failingUrl = faker.internet.url();
      const failingBuildTime = '2026-11-26T09:00:00.0000000+01:00';
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(
              projectXml('application / Build', 'Success'),
              projectXml('application / Test', 'Failure', {
                webUrl: failingUrl,
                lastBuildTime: failingBuildTime,
              })
            )
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: undefined }).getState();
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: failingUrl,
        error: {
          id: `application / Test_${failingBuildTime}`,
          description: 'application / Test Build Failed',
        },
      });
    });

    it('should match multiple projects with a wildcard and ignore the rest', async () => {
      const failingUrl = faker.internet.url();
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(
              projectXml('application / Build', 'Failure'),
              projectXml('application / Test-unit', 'Success'),
              projectXml('application / Test-e2e', 'Failure', { webUrl: failingUrl })
            )
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: 'application / Test*' }).getState();
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: failingUrl,
        error: {
          id: 'application / Test-e2e_2005-09-28T10:30:34.6362160+01:00',
          description: 'application / Test-e2e Build Failed',
        },
      });
    });

    it('should match a wildcard in the middle of the project pattern', async () => {
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(projectXml('application / Build', 'Success'), projectXml('application / WebTests', 'Failure'))
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: 'application / *Test*' }).getState();
      expect(result.status).toBe(Status.FAILURE);
    });

    it('should rank an unknown build above a building one', async () => {
      const unknownUrl = faker.internet.url();
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(
              projectXml('application / Build', 'Success', { activity: 'Building' }),
              projectXml('application / Test', 'Unknown', { webUrl: unknownUrl })
            )
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: 'application / *' }).getState();
      expect(result).toEqual({
        name: config.alias,
        status: Status.NA,
        link: unknownUrl,
      });
    });

    it('should report every failed build when several match', async () => {
      const firstTime = '2026-11-26T09:00:00.0000000+01:00';
      const secondTime = '2026-11-26T10:00:00.0000000+01:00';
      const firstUrl = faker.internet.url();
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(
              projectXml('application / Test-unit', 'Failure', { webUrl: firstUrl, lastBuildTime: firstTime }),
              projectXml('application / Test-e2e', 'Failure', { lastBuildTime: secondTime })
            )
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: 'application / Test*' }).getState();
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: firstUrl,
        error: {
          id: `application / Test-unit_${firstTime}, application / Test-e2e_${secondTime}`,
          description: 'application / Test-unit, application / Test-e2e Build Failed',
        },
      });
    });

    it('should treat regex characters in the project pattern literally', async () => {
      const successUrl = faker.internet.url();
      fetchtMock.mockResolvedValue({
        text: () =>
          Promise.resolve(
            projectsXml(
              projectXml('application (v2) / [main] build', 'Success', { webUrl: successUrl }),
              projectXml('application v2 / main build', 'Failure')
            )
          ),
        ok: true,
      });
      const result = await new CCTray({ ...config, name: 'application (v2) / [main] *' }).getState();
      expect(result).toEqual({
        name: config.alias,
        status: Status.SUCCESS,
        link: successUrl,
      });
    });
  });
});
