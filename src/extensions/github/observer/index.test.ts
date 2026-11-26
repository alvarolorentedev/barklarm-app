import { GithubActionConfiguration } from '../type';
import { GithubAction } from '.';
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

describe('Github Action', () => {
  let config: GithubActionConfiguration;
  let observer: GithubAction;

  beforeEach(() => {
    fetchMock.mockClear();
    config = {
      type: 'githubAction',
      authToken: faker.lorem.word(),
      owner: faker.lorem.word(),
      repo: faker.lorem.word(),
      workflowId: faker.lorem.word(),
      alias: faker.lorem.word(),
    };
    observer = new GithubAction(config);
  });

  it('returns NA when the request fails', async () => {
    fetchMock.mockResolvedValue(reply({}, false));
    const result = await observer.getState();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}/runs`),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({
      name: config.alias,
      status: Status.NA,
      link: `https://github.com/${config.owner}/${config.repo}/actions/`,
    });
  });

  it('returns NA when there are no runs', async () => {
    fetchMock.mockResolvedValue(reply({ total_count: 0, workflow_runs: [] }));
    const result = await observer.getState();
    expect(result.status).toBe(Status.NA);
  });

  it.each([
    [null, Status.CHECKING],
    ['success', Status.SUCCESS],
    ['failure', Status.FAILURE],
  ])('maps conclusion %s to status %s', async (conclusion, expected) => {
    const expectedUrl = faker.internet.url();
    fetchMock.mockResolvedValue(
      reply({
        total_count: 1,
        workflow_runs: [{ conclusion, html_url: expectedUrl, id: 1, name: 'build' }],
      })
    );
    const result = await observer.getState();
    expect(result.status).toBe(expected);
    expect(result.link).toBe(expectedUrl);
  });

  it('adds failure details with the run attempt', async () => {
    const expectedName = faker.lorem.sentence();
    const expectedId = faker.number.int();
    const expectedUrl = faker.internet.url();
    fetchMock.mockResolvedValue(
      reply({
        total_count: 1,
        workflow_runs: [
          { id: expectedId, name: expectedName, conclusion: 'failure', html_url: expectedUrl, run_attempt: 2 },
        ],
      })
    );
    const result = await observer.getState();
    expect(result.error).toEqual({
      description: `${expectedName} Workflow Failed`,
      id: `${expectedId}:2`,
    });
  });

  it('defaults the failure attempt to 1', async () => {
    fetchMock.mockResolvedValue(
      reply({
        total_count: 1,
        workflow_runs: [{ id: 42, name: 'build', conclusion: 'failure', html_url: 'https://example.test/run' }],
      })
    );
    const result = await observer.getState();
    expect(result.error?.id).toBe('42:1');
  });

  it('returns NA when the request throws', async () => {
    fetchMock.mockRejectedValue('kaboom');
    const result = await observer.getState();
    expect(result.status).toBe(Status.NA);
  });

  it('uses owner/repo/workflowId when no alias is set', async () => {
    fetchMock.mockResolvedValue(reply({ total_count: 0, workflow_runs: [] }));
    config.alias = undefined;
    observer = new GithubAction(config);
    const result = await observer.getState();
    expect(result.name).toBe(`GitHub: ${config.owner}/${config.repo}/${config.workflowId}`);
  });

  it('exposes a diagnostic provider and a source-based scope', () => {
    expect(observer.getDiagnosticProvider()?.sourceType).toBe('githubAction');
    expect(observer.getDiagnosticScope()).toBe(
      `github.com/${config.owner}/${config.repo}/workflows/${config.workflowId}`
    );
  });
});
