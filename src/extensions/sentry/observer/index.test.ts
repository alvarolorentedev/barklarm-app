import { Sentry } from '.';
import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { SentryConfiguration } from '../type';
import { expect, describe, it, vi, beforeEach } from 'vitest';

const fetchtMock = vi.fn();
vi.mock('../../fetch-adapter', () => {
  return {
    __esModule: true,
    fetchWrapper: (...all: any) => fetchtMock(...all),
  };
});

describe('Sentry', () => {
  describe('getState', () => {
    let config: SentryConfiguration;
    let observer: Sentry;

    let expectedUrl: string;
    let expectedSite: string;

    beforeEach(() => {
      fetchtMock.mockClear();
      config = {
        type: 'sentry',
        organization: faker.lorem.word(),
        project: faker.lorem.word(),
        authToken: faker.lorem.word(),
        alias: faker.lorem.word(),
      };
      expectedUrl = `https://sentry.io/api/0/projects/${config.organization}/${config.project}/issues/`;
      expectedSite = `https://sentry.io/organizations/${config.organization}/projects/${config.project}`;
      observer = new Sentry(config);
    });

    it('shoulds return NA status if request return diferent value than 200', async () => {
      fetchtMock.mockResolvedValue({
        json: () => Promise.resolve('kaboom'),
        ok: false,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(expectedUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.authToken}`,
        },
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.NA,
        link: expectedSite,
      });
    });
    it('shoulds return SUCCESS status if request return empty array', async () => {
      fetchtMock.mockResolvedValue({
        json: () => Promise.resolve([]),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(expectedUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.authToken}`,
        },
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.SUCCESS,
        link: expectedSite,
      });
    });
    it('shoulds return FAILURE status if request return non empty array', async () => {
      const expectedId = 'expectedId';
      const expectedTitle = 'expectedTitle';
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve([
            {
              id: expectedId,
              title: expectedTitle,
            },
          ]),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(expectedUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.authToken}`,
        },
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: expectedSite,
        error: {
          description: expectedTitle,
          id: expectedId,
        },
      });
    });
  });
});
