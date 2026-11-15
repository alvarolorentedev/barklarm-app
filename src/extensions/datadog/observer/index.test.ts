import { DatadogMonitor } from '.';
import { faker } from '@faker-js/faker';
import { Status } from '../../../types/Status';
import { DetadogMonitorConfiguration } from '../type';
import { expect, describe, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('../../fetch-adapter', () => ({
  fetchWrapper: (...args: any[]) => fetchMock(...args),
}));

const reply = (data: any, ok = true) => ({
  ok,
  json: () => Promise.resolve(data),
});

describe('Datadog', () => {
  let config: DetadogMonitorConfiguration;
  let observer: DatadogMonitor;
  let expectLink: string;

  beforeEach(() => {
    fetchMock.mockClear();
    config = {
      type: 'datadogMonitor',
      site: 'datadoghq.com',
      apiKey: faker.lorem.word(),
      appKey: faker.lorem.word(),
      monitorId: faker.number.int(),
      alias: faker.lorem.word(),
    };
    expectLink = `https://app.${config.site}/monitors/${config.monitorId}`;
    observer = new DatadogMonitor(config);
  });

  it('requests the monitor endpoint with both keys', async () => {
    fetchMock.mockResolvedValue(reply({ overall_state: 'OK' }));
    await observer.getState();
    expect(fetchMock).toHaveBeenCalledWith(`https://api.${config.site}/api/v1/monitor/${config.monitorId}`, {
      method: 'GET',
      headers: {
        'DD-API-KEY': config.apiKey,
        'DD-APPLICATION-KEY': config.appKey,
      },
    });
  });

  it('returns NA when the request fails', async () => {
    fetchMock.mockRejectedValue('kaboom');
    const result = await observer.getState();
    expect(result).toEqual({ name: config.alias, status: Status.NA, link: expectLink });
  });

  it.each([
    ['Unknown', Status.NA],
    ['No Data', Status.NA],
    ['Skipped', Status.NA],
    ['OK', Status.SUCCESS],
  ])('maps overall_state %s to %s', async (overall_state, expected) => {
    fetchMock.mockResolvedValue(reply({ overall_state }));
    const result = await observer.getState();
    expect(result).toEqual({ name: config.alias, status: expected, link: expectLink });
  });

  it.each(['Alert', 'Warn'])('maps %s to FAILURE with details', async (overall_state) => {
    const expectedMessage = faker.lorem.sentence();
    const expectedId = faker.number.int();
    fetchMock.mockResolvedValue(reply({ id: expectedId, message: expectedMessage, overall_state }));
    const result = await observer.getState();
    expect(result).toEqual({
      name: config.alias,
      status: Status.FAILURE,
      link: expectLink,
      muted: undefined,
      issueEndpoint: undefined,
      error: { description: expectedMessage, id: expectedId.toString() },
    });
  });
});
