import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { NewRelicConfiguration } from '../type';
import { NewRelic } from '.';
import { expect, describe, it, vi, beforeEach } from 'vitest';

const fetchtMock = vi.fn();
vi.mock('../../fetch-adapter', () => {
  return {
    __esModule: true,
    fetchWrapper: (...all: any) => fetchtMock(...all),
  };
});

describe('NewRelic', () => {
  describe('getState', () => {
    let config: NewRelicConfiguration;
    let observer: NewRelic;

    let expectedUrl: string;
    let expectedSite: string;

    beforeEach(() => {
      fetchtMock.mockClear();
      config = {
        type: 'newRelic',
        site: faker.internet.url(),
        apiKey: faker.lorem.word(),
        alias: faker.lorem.word(),
      };
      expectedUrl = `https://api.${config.site}/v2/alerts_violations.json`;
      expectedSite = `https://one.${config.site}/nrai`;
      observer = new NewRelic(config);
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
          'X-Api-Key': `${config.apiKey}`,
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
        json: () => Promise.resolve({ violations: [] }),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(expectedUrl, {
        method: 'GET',
        headers: {
          'X-Api-Key': `${config.apiKey}`,
        },
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.SUCCESS,
        link: expectedSite,
      });
    });
    it('shoulds return FAILURE status if request return non empty violations array', async () => {
      const expectedId = 'expectedId';
      const expectedMessage = 'expectedMessage';
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            violations: [
              {
                id: expectedId,
                condition_name: expectedMessage,
              },
            ],
          }),
        ok: true,
      });
      const result = await observer.getState();
      expect(fetchtMock).toBeCalledWith(expectedUrl, {
        method: 'GET',
        headers: {
          'X-Api-Key': `${config.apiKey}`,
        },
      });
      expect(result).toEqual({
        name: config.alias,
        status: Status.FAILURE,
        link: expectedSite,
        error: {
          description: expectedMessage,
          id: expectedId,
        },
      });
    });
  });
});
