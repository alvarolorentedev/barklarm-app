import { Opsgenie } from '.';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { OpsgenieConfiguration } from '../type';

const fetchMock = vi.fn();

vi.mock('../../fetch-adapter', () => ({
  fetchWrapper: (...args: any[]) => fetchMock(...args),
}));

const reply = (data: any, ok = true) => ({
  ok,
  json: () => Promise.resolve(data),
});

describe('Opsgenie', () => {
  let config: OpsgenieConfiguration;
  let observer: Opsgenie;

  beforeEach(() => {
    fetchMock.mockClear();
    config = {
      type: 'opsgenie',
      apiKey: faker.lorem.word(),
      host: 'opsgenie.com',
      identifier: faker.lorem.word(),
      alias: faker.lorem.word(),
    };
    observer = new Opsgenie(config);
  });

  const expectedId = 'expectedId';
  const expectedMessage = 'expectedMessage';

  it('requests the alert and authenticates with the API key', async () => {
    fetchMock.mockResolvedValue(reply({ data: { status: 'closed', id: expectedId, message: expectedMessage } }));
    await observer.getState();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.${config.host}/v2/alerts/${config.identifier}?identifierType=id`,
      {
        method: 'GET',
        headers: { Authorization: `GenieKey ${config.apiKey}` },
      }
    );
  });

  it.each([
    ['closed', Status.SUCCESS, undefined],
    ['open', Status.FAILURE, { description: expectedMessage, id: expectedId }],
  ])('maps alert status %s to %s', async (status, expected, error) => {
    fetchMock.mockResolvedValue(reply({ data: { status, id: expectedId, message: expectedMessage } }));
    const result = await observer.getState();
    expect(result).toEqual({
      name: config.alias,
      status: expected,
      link: `https://app.${config.host}/alert/detail/${config.identifier}/details`,
      muted: undefined,
      issueEndpoint: undefined,
      error,
    });
  });

  it('returns NA when the request fails', async () => {
    fetchMock.mockRejectedValue('kaboom');
    const result = await observer.getState();
    expect(result.status).toBe(Status.NA);
  });
});
