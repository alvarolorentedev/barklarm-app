import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { GrafanaConfiguration } from '../type';
import { Grafana } from './';

const fetchtMock = vi.fn();
vi.mock('../../fetch-adapter', () => {
  return {
    __esModule: true,
    fetchWrapper: (...all: any) => fetchtMock(...all),
  };
});

describe('Grafana', () => {
  describe('getState', () => {
    let config: GrafanaConfiguration;
    let observer: Grafana;

    let expectedUrl: string;
    let expectedSite: string;

    beforeEach(() => {
      fetchtMock.mockClear();
      config = {
        type: 'grafana',
        url: faker.internet.url(),
        authToken: faker.lorem.word(),
        alias: faker.lorem.word(),
      };
      expectedUrl = `${config.url}/api/v1/provisioning/alert-rules`;
      expectedSite = `${config.url}/alerting`;
      observer = new Grafana(config);
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
    it('shoulds return SUCCESS status if request return empty violations array', async () => {
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve([
            {
              execErrState: 'Success',
            },
            {
              execErrState: 'Success',
            },
            {
              execErrState: 'Success',
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
        status: Status.SUCCESS,
        link: expectedSite,
      });
    });
    it('shoulds return FAILURE status if request have active alarms', async () => {
      const expectedId = 'expectedId';
      const expectedTitle = 'expectedTitle';
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve([
            {
              execErrState: 'Error',
              uid: expectedId,
              title: expectedTitle,
            },
            {
              execErrState: 'Success',
            },
            {
              execErrState: 'Success',
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
