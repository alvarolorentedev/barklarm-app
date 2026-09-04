import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { BitbucketConfiguration } from '../type';
import { Bitbucket } from './';

const fetchtMock = vi.fn();
vi.mock('../../fetch-adapter', () => {
  return {
    __esModule: true,
    fetchWrapper: (...all: any) => fetchtMock(...all),
  };
});

describe('Bitbucket', () => {
  describe('getState', () => {
    let config: BitbucketConfiguration;
    let observer: Bitbucket;

    let expectedUrl: string;

    beforeEach(() => {
      fetchtMock.mockClear();
      config = {
        type: 'bitbucket',
        workspace: faker.lorem.word(),
        repo: faker.lorem.word(),
        branch: faker.lorem.word(),
        authToken: faker.lorem.word(),
        alias: faker.lorem.word(),
      };
      expectedUrl = `https://api.bitbucket.org/2.0/repositories/${config.workspace}/${config.repo}/pipelines?target.ref_name=${config.branch}&sort=-created_on`;
      observer = new Bitbucket(config);
    });

    it('shoulds return NA status if request return different value than 200', async () => {
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
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/branch/${config.branch}/page/1`,
      });
    });

    it('shoulds return NA status if request return no pipeline values', async () => {
      fetchtMock.mockResolvedValue({
        json: () => Promise.resolve({ page: 1, values: [] }),
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
        status: Status.NA,
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/branch/${config.branch}/page/1`,
      });
    });

    it('shoulds return SUCCESS status if state is COMPLETED and result SUCCESSFUL', async () => {
      const buildNumber = faker.number.int();
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            page: 1,
            values: [
              {
                uuid: faker.lorem.word(),
                build_number: buildNumber,
                state: {
                  name: 'COMPLETED',
                  type: 'pipeline_state_completed',
                  result: {
                    name: 'SUCCESSFUL',
                    type: 'pipeline_state_completed_successful',
                  },
                },
              },
            ],
          }),
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
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/${buildNumber}`,
      });
    });

    it('shoulds return FAILURE status if state is COMPLETED and result FAILED', async () => {
      const buildNumber = faker.number.int();
      const buildUUID = faker.lorem.word();
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            page: 1,
            values: [
              {
                uuid: buildUUID,
                build_number: buildNumber,
                state: {
                  name: 'COMPLETED',
                  type: 'pipeline_state_completed',
                  result: {
                    name: 'FAILED',
                    type: 'pipeline_state_completed_failed',
                  },
                },
              },
            ],
          }),
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
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/${buildNumber}`,
        error: {
          description: 'Pipeline Failed',
          id: buildUUID,
        },
      });
    });

    it('shoulds return FAILURE status if state is COMPLETED and result ERROR', async () => {
      const buildNumber = faker.number.int();
      const buildUUID = faker.lorem.word();
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            page: 1,
            values: [
              {
                uuid: buildUUID,
                build_number: buildNumber,
                state: {
                  name: 'COMPLETED',
                  type: 'pipeline_state_completed',
                  result: {
                    name: 'ERROR',
                    type: 'pipeline_state_completed_error',
                  },
                },
              },
            ],
          }),
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
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/${buildNumber}`,
        error: {
          description: 'Pipeline Failed',
          id: buildUUID,
        },
      });
    });

    it('shoulds return CHECKING status if state is not COMPLETED', async () => {
      const buildNumber = faker.number.int();
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            page: 1,
            values: [
              {
                uuid: faker.lorem.word(),
                build_number: buildNumber,
                state: {
                  name: 'IN_PROGRESS',
                  type: 'pipeline_state_in_progress_running',
                  stage: {
                    name: 'RUNNING',
                    type: 'pipeline_state_in_progress_running',
                  },
                },
              },
            ],
          }),
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
        status: Status.CHECKING,
        link: `https://bitbucket.org/${config.workspace}/${config.repo}/pipelines/results/${buildNumber}`,
      });
    });

    it('shoulds return repo/branch if no alias', async () => {
      fetchtMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            page: 1,
            values: [],
          }),
        ok: true,
      });

      config = {
        type: 'bitbucket',
        workspace: faker.lorem.word(),
        repo: faker.lorem.word(),
        branch: faker.lorem.word(),
        authToken: faker.lorem.word(),
        alias: undefined,
      };
      observer = new Bitbucket(config);
      const result = await observer.getState();
      expect(result.name).toEqual(`Bitbucket: ${config.repo}/${config.branch}`);
    });
  });
});
