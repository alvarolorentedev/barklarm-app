import { AzureDevOpsConfiguration } from '../type';
import { AzureDevOps } from '.';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';

const fetchMock = vi.fn();

vi.mock('../../fetch-adapter', () => ({
  fetchWrapper: (...args: any[]) => fetchMock(...args),
}));

const reply = (data: any, ok = true) => ({
  ok,
  json: () => Promise.resolve(data),
});

describe('Azure DevOps', () => {
  let config: AzureDevOpsConfiguration;
  let observer: AzureDevOps;

  beforeEach(() => {
    fetchMock.mockClear();
    config = {
      type: 'azureDevOps',
      authToken: faker.lorem.word(),
      project: faker.lorem.word(),
      orgUrl: 'https://dev.azure.com/example',
      pipelineId: faker.number.int(),
      alias: faker.lorem.word(),
    };
    observer = new AzureDevOps(config);
  });

  const expectedId = '42';
  const expectedName = 'build';

  it('returns NA when the request fails', async () => {
    fetchMock.mockResolvedValue(reply({}, false));
    const result = await observer.getState();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/_apis/pipelines/${config.pipelineId}/runs`),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ name: config.alias, status: Status.NA, link: config.orgUrl });
  });

  it.each([
    ['completed', 'succeeded', Status.SUCCESS, undefined],
    ['completed', 'failed', Status.FAILURE, { id: expectedId, description: `${expectedName} Workflow Failed` }],
    ['completed', 'canceled', Status.NA, undefined],
    ['completed', 'unknown', Status.NA, undefined],
    ['canceling', 'succeeded', Status.CHECKING, undefined],
    ['inProgress', 'succeeded', Status.CHECKING, undefined],
    ['unknown', 'succeeded', Status.CHECKING, undefined],
  ])('maps state %s and result %s to %s', async (state, result, expected, error) => {
    const href = faker.internet.url();
    fetchMock.mockResolvedValue(
      reply({
        value: [{ state, result, id: expectedId, name: expectedName, _links: { web: { href } } }],
      })
    );
    const response = await observer.getState();
    expect(response).toEqual({ name: config.alias, status: expected, link: href, error });
  });

  it('returns NA when there are no runs', async () => {
    fetchMock.mockResolvedValue(reply({ value: [] }));
    const result = await observer.getState();
    expect(result.status).toBe(Status.NA);
  });
});
