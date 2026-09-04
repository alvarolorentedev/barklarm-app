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

    it('shoulds return SUCCESS status if request return xml with non defined name should return first of the list', async () => {
      const expectUrl = faker.internet.url();
      const expectedResponseText = ` <Projects>
            <Project
                name="unselected-test-1"
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
                webUrl="http://randomurl.com"/>
            <Project
            name="unselected-test-3"
            activity="Sleeping"
            lastBuildStatus="Failure"
            lastBuildLabel="8"
            lastBuildTime="2005-09-28T10:30:34.6362160+01:00"
            nextBuildTime="2005-10-04T14:31:52.4509248+01:00"
            webUrl="http://randomurl.com"/>
        </Projects>`;
      fetchtMock.mockResolvedValue({
        text: () => Promise.resolve(expectedResponseText),
        ok: true,
      });
      (observer as any).projectName = undefined;
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
  });
});
