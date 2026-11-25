import { describe, expect, it, vi } from 'vitest';
import { DIAGNOSTIC_LIMITS } from '../../../core/diagnostics/limits';
import { EvidenceCollectionOptions } from '../../../types/Diagnostics';
import { GithubDiagnosticProvider } from './provider';

const run = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  run_attempt: 2,
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  head_branch: 'main',
  head_sha: 'abc123',
  event: 'push',
  created_at: '2026-01-15T10:00:00Z',
  run_started_at: '2026-01-15T10:00:05Z',
  updated_at: '2026-01-15T10:04:00Z',
  html_url: 'https://github.com/acme/api/actions/runs/1001',
  repository: { full_name: 'acme/api' },
  ...overrides,
});

const failedJob = {
  id: 2001,
  name: 'build',
  conclusion: 'failure',
  html_url: 'https://github.com/acme/api/actions/runs/1001/job/2001',
  started_at: '2026-01-15T10:00:10Z',
  completed_at: '2026-01-15T10:03:00Z',
  steps: [
    { number: 1, name: 'checkout', conclusion: 'success', started_at: '2026-01-15T10:00:11Z' },
    { number: 2, name: 'test', conclusion: 'failure', started_at: '2026-01-15T10:01:00Z' },
  ],
};

const healthyJob = {
  id: 2002,
  name: 'lint',
  conclusion: 'success',
  html_url: 'https://github.com/acme/api/actions/runs/1001/job/2002',
  steps: [{ number: 1, name: 'lint', conclusion: 'success' }],
};

type HeadersLike = Record<string, string>;

function response(status: number, body: unknown, headers: HeadersLike = {}) {
  const map: HeadersLike = {};
  for (const [key, value] of Object.entries(headers)) map[key.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => map[name.toLowerCase()] ?? null },
    body: null as null,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function redirect(location: string) {
  return response(302, '', { location });
}

function options(overrides: Partial<EvidenceCollectionOptions['limits']> = {}): EvidenceCollectionOptions {
  return {
    signal: new AbortController().signal,
    limits: { ...DIAGNOSTIC_LIMITS, ...overrides },
  };
}

function provider(fetchMock: ReturnType<typeof vi.fn>) {
  return new GithubDiagnosticProvider({
    owner: 'acme',
    repo: 'api',
    authToken: 'configured-token-value',
    fetch: fetchMock as any,
  });
}

function failure(failureId = '1001:2') {
  return {
    observerId: 'observer-1',
    sourceType: 'githubAction',
    failureId,
    link: 'https://github.com/acme/api/actions/runs/1001',
  };
}

const logUrl = 'https://productionresultssa1.blob.core.windows.net/logs/2001?sig=synthetic';

function completeFetch(log = 'npm ERR! code ERESOLVE\nnpm ERR! Could not resolve dependency') {
  return vi.fn(async (url: string, init: any) => {
    if (url.endsWith('/actions/runs/1001/attempts/2')) {
      expect(init.headers.Authorization).toBe('Bearer configured-token-value');
      return response(200, run());
    }
    if (url.includes('/actions/runs/1001/attempts/2/jobs')) {
      return response(200, { total_count: 2, jobs: [failedJob, healthyJob] });
    }
    if (url.endsWith('/actions/jobs/2001/logs')) {
      expect(init.headers.Authorization).toBe('Bearer configured-token-value');
      return redirect(logUrl);
    }
    if (url === logUrl) {
      expect(init.headers.Authorization).toBeUndefined();
      return response(200, log);
    }
    throw new Error(`unexpected url ${url}`);
  });
}

describe('GithubDiagnosticProvider', () => {
  it('collects the exact attempt, failed jobs, failed steps and bounded log excerpts', async () => {
    const fetchMock = completeFetch();
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.completeness).toBe('complete');
    expect(evidence.summary).toContain('run 1001 attempt 2');
    expect(evidence.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['execution', 'job:2001', 'step:2001:2', 'error:2001:0'])
    );
    expect(evidence.items.map((item) => item.id)).not.toContain('job:2002');
    expect(evidence.items.find((item) => item.id === 'error:2001:0')?.content).toContain('ERESOLVE');
    expect(JSON.stringify(evidence)).not.toContain('configured-token-value');

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/attempts/2/jobs'))).toBe(true);
    expect(urls.some((url) => url.includes('/actions/runs/1001/attempts/2') && !url.includes('/jobs'))).toBe(true);
  });

  it('resolves the attempt for a legacy failure ID before fetching jobs', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/actions/runs/1001')) return response(200, { id: 1001, run_attempt: 2 });
      if (url.endsWith('/actions/runs/1001/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 2, jobs: [failedJob, healthyJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure('1001'), options());
    expect(evidence.summary).toContain('attempt 2');
  });

  it('rejects an attempt mismatch', async () => {
    const fetchMock = vi.fn(async () => response(200, run({ run_attempt: 3 })));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.completeness).toBe('unavailable');
    expect(evidence.limitations).toContain('run_mismatch');
    expect(evidence.items).toEqual([]);
  });

  it('reports inaccessible logs as partial without inventing a failure', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 2, jobs: [failedJob, healthyJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(404, { message: 'Not Found' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.completeness).toBe('partial');
    expect(evidence.limitations).toContain('logs_unavailable');
    expect(evidence.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['execution', 'job:2001', 'step:2001:2'])
    );
    expect(evidence.items.some((item) => item.category === 'error')).toBe(false);
  });

  it('distinguishes an empty log from an unavailable one', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, '   \n');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toEqual(expect.arrayContaining(['log_empty', 'no_error_signal']));
  });

  it('does not retry or collect when GitHub rate-limits the run request', async () => {
    const fetchMock = vi.fn(async () => response(403, { message: 'rate limited' }, { 'x-ratelimit-remaining': '0' }));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.completeness).toBe('unavailable');
    expect(evidence.limitations).toEqual(['rate_limited']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a deleted or inaccessible run', async () => {
    const fetchMock = vi.fn(async () => response(404, { message: 'Not Found' }));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual(['run_not_found']);
  });

  it('rejects an unrelated log redirect without fetching it', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return redirect('https://evil.example/logs?sig=x');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('redirect_rejected');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('evil.example'))).toBe(false);
  });

  it('rejects an oversized log before reading its body', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'ignored', { 'content-length': '99999999' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('log_too_large');
  });

  it('reports malformed API responses safely', async () => {
    const fetchMock = vi.fn(async () => response(200, 'not json'));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual(['invalid_response']);
  });

  it('reports a failure conclusion with no failed jobs as partial', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [healthyJob] });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.completeness).toBe('partial');
    expect(evidence.limitations).toContain('no_failed_jobs');
  });

  it('does not treat cancellation or skipping as a diagnostic failure', async () => {
    const fetchMock = vi.fn(async () => response(200, run({ conclusion: 'cancelled' })));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.completeness).toBe('unavailable');
    expect(evidence.limitations).toEqual(['non_failure_conclusion']);
    expect(evidence.summary).toContain('cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks a job list as truncated when the API reports more jobs than it returns', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 3, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('jobs_truncated');
  });

  it('handles pagination within explicit limits', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('page=1')) {
        return response(200, {
          total_count: 5,
          jobs: [
            { ...failedJob, id: 3001 },
            { ...healthyJob, id: 3002 },
          ],
        });
      }
      if (url.includes('page=2')) {
        return response(200, {
          total_count: 5,
          jobs: [
            { ...healthyJob, id: 3003 },
            { ...healthyJob, id: 3004 },
          ],
        });
      }
      if (url.includes('/actions/jobs/')) return response(404, { message: 'Not Found' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options({ jobsPerPage: 2, maxJobPages: 2 }));
    expect(evidence.limitations).toContain('jobs_truncated');
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('page=2'))).toBe(true);
  });

  it('marks missing step metadata as partial', async () => {
    const job = { ...failedJob, steps: [] as any[] };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [job] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('job_steps_unavailable');
  });

  it('throws transient API errors so the manager can retry once', async () => {
    const fetchMock = vi.fn(async () => response(500, { message: 'server error' }));
    await expect(provider(fetchMock).collectEvidence(failure(), options())).rejects.toThrow('github 500');
  });

  it('rejects an invalid failure reference without a request', async () => {
    const fetchMock = vi.fn();
    const evidence = await provider(fetchMock).collectEvidence(failure('not-a-run'), options());

    expect(evidence.limitations).toEqual(['invalid_failure_reference']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an incomplete run and a missing conclusion', async () => {
    const incomplete = vi.fn(async () => response(200, run({ status: 'in_progress' })));
    expect((await provider(incomplete).collectEvidence(failure(), options())).limitations).toEqual(['run_incomplete']);

    const missing = vi.fn(async () => response(200, run({ conclusion: null })));
    expect((await provider(missing).collectEvidence(failure(), options())).limitations).toEqual(['invalid_response']);
  });

  it('rejects a legacy run lookup that returns another run', async () => {
    const fetchMock = vi.fn(async () => response(200, { id: 9999, run_attempt: 1 }));
    const evidence = await provider(fetchMock).collectEvidence(failure('1001'), options());

    expect(evidence.limitations).toEqual(['run_mismatch']);
  });

  it('rejects an attempt response for another run', async () => {
    const fetchMock = vi.fn(async () => response(200, run({ id: 9999 })));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual(['run_mismatch']);
  });

  it.each([
    [401, {}, 'auth_failed'],
    [403, {}, 'forbidden'],
    [429, {}, 'rate_limited'],
  ])('maps a run status %s to %s', async (status, headers, limitation) => {
    const fetchMock = vi.fn(async () => response(status, { message: 'error' }, headers as Record<string, string>));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual([limitation]);
  });

  it('reports a request failure for an unexpected status', async () => {
    const fetchMock = vi.fn(async () => response(0, { message: 'opaque' }));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual(['request_failed']);
  });

  it('reports an oversized JSON response without parsing it', async () => {
    const fetchMock = vi.fn(async () => response(200, run(), { 'content-length': '99999999' }));
    const evidence = await provider(fetchMock).collectEvidence(failure(), options());

    expect(evidence.limitations).toEqual(['response_too_large']);
  });

  it('keeps the execution item when jobs are inaccessible', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(403, { message: 'Forbidden' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.completeness).toBe('partial');
    expect(evidence.limitations).toContain('forbidden');
    expect(evidence.items.map((item) => item.id)).toEqual(['execution']);
  });

  it('reports malformed job lists and invalid or duplicate job entries', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) {
        return response(200, {
          total_count: 3,
          jobs: [null, { id: 'bad' }, { ...failedJob, id: 2001 }, { ...failedJob, id: 2001 }],
        });
      }
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('invalid_job');
    expect(evidence.items.some((item) => item.id === 'job:2001')).toBe(true);
  });

  it('reports malformed job payloads as partial', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: 'nope' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('invalid_response');
  });

  it('reports failed-job and log-request truncation', async () => {
    const secondJob = { ...failedJob, id: 2003, name: 'test-2' };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 2, jobs: [failedJob, secondJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options({ maxLogRequests: 1 }));
    expect(evidence.limitations).toContain('log_requests_truncated');
    expect((await provider(fetchMock).collectEvidence(failure(), options({ maxFailedJobs: 1 }))).limitations).toContain(
      'failed_jobs_truncated'
    );
  });

  it('skips malformed steps and falls back to a computed job URL', async () => {
    const job = {
      ...failedJob,
      html_url: 'not a url',
      steps: [null, { number: 'bad', conclusion: 'failure' }, { number: 3, name: 'ok', conclusion: 'failure' }],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [job] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, 'Error: boom');
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('invalid_step');
    expect(evidence.items.map((item) => item.id)).toContain('step:2001:3');
    expect(evidence.items.find((item) => item.id === 'job:2001')?.source?.url).toBe(
      'https://github.com/acme/api/actions/runs/1001/job/2001'
    );
  });

  it.each([
    [401, {}, 'auth_failed'],
    [403, {}, 'logs_unavailable'],
    [429, {}, 'rate_limited'],
  ])('maps log status %s to %s', async (status, headers, limitation) => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(status, 'error', headers as Record<string, string>);
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain(limitation);
  });

  it('throws a transient log status so the manager can retry', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(500, 'error');
      throw new Error(`unexpected url ${url}`);
    });

    await expect(provider(fetchMock).collectEvidence(failure(), options())).rejects.toThrow('github logs 500');
  });

  it.each([
    ['missing location', response(302, '')],
    ['invalid URL', redirect('not a url')],
    ['plain HTTP', redirect('http://productionresultssa1.blob.core.windows.net/logs/1')],
    ['URL credentials', redirect('https://user:pass@productionresultssa1.blob.core.windows.net/logs/1')],
    ['non-standard port', redirect('https://productionresultssa1.blob.core.windows.net:8443/logs/1')],
  ])('rejects a log redirect with %s', async (_name, logResponse) => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return logResponse;
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('redirect_rejected');
  });

  it('rejects a failed log download and retries a download server error', async () => {
    const build = (download: ReturnType<typeof response>) =>
      vi.fn(async (url: string) => {
        if (url.endsWith('/attempts/2')) return response(200, run());
        if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
        if (url.endsWith('/actions/jobs/2001/logs')) return redirect(logUrl);
        if (url === logUrl) return download;
        throw new Error(`unexpected url ${url}`);
      });

    const rejected = await provider(build(response(404, 'missing'))).collectEvidence(failure(), options());
    expect(rejected.limitations).toContain('redirect_rejected');
    await expect(provider(build(response(500, 'error'))).collectEvidence(failure(), options())).rejects.toThrow(
      'github log download 500'
    );
  });

  it('reads a bounded stream and cancels oversized reads', async () => {
    const stream = (chunks: string[], headers: Record<string, string> = {}) => {
      const values = chunks.map((chunk) => new TextEncoder().encode(chunk));
      let index = 0;
      let cancelled = false;
      const map: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) map[key.toLowerCase()] = value;
      return {
        ok: true,
        status: 200,
        headers: { get: (name: string) => map[name.toLowerCase()] ?? null },
        body: {
          getReader: () => ({
            read: async () =>
              index < values.length ? { done: false, value: values[index++] } : { done: true, value: undefined },
            cancel: async () => {
              cancelled = true;
            },
          }),
        },
        text: async () => '',
        wasCancelled: () => cancelled,
      };
    };

    const big = stream([`Error: boom${'x'.repeat(1200)}`]);
    const bigFetch = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return big;
      throw new Error(`unexpected url ${url}`);
    });
    const truncated = await provider(bigFetch).collectEvidence(failure(), options({ maxResponseBytes: 1000 }));
    expect(big.wasCancelled()).toBe(true);
    expect(truncated.limitations).toContain('log_truncated');
    expect(truncated.items.find((item) => item.id === 'error:2001:0')?.content).toContain('Error: boom');

    const complete = stream(['Error: ', 'boom']);
    const completeFetch = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return complete;
      throw new Error(`unexpected url ${url}`);
    });
    const evidence = await provider(completeFetch).collectEvidence(failure(), options());
    expect(evidence.completeness).toBe('complete');
    expect(evidence.items.find((item) => item.id === 'error:2001:0')?.content).toContain('Error: boom');
  });

  it('truncates a plain-text log when content length is absent', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) return response(200, { total_count: 1, jobs: [failedJob] });
      if (url.endsWith('/actions/jobs/2001/logs')) return response(200, `Error: ${'x'.repeat(1200)}`);
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options({ maxResponseBytes: 1000 }));
    expect(evidence.limitations).toContain('log_truncated');
  });

  it('discards an error response body when possible', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/attempts/2')) return response(200, run());
      if (url.includes('/attempts/2/jobs')) {
        const body = response(404, { message: 'Not Found' });
        return { ...body, body: { cancel } };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await provider(fetchMock).collectEvidence(failure(), options());
    expect(evidence.limitations).toContain('jobs_unavailable');
    expect(cancel).toHaveBeenCalled();
  });

  it('omits authorization when no token is configured and handles a minimal run', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      expect(init.headers.Authorization).toBeUndefined();
      if (url.endsWith('/attempts/2')) {
        return response(200, {
          id: 1001,
          run_attempt: 2,
          status: 'completed',
          conclusion: 'failure',
        });
      }
      if (url.includes('/attempts/2/jobs')) return response(404, { message: 'Not Found' });
      throw new Error(`unexpected url ${url}`);
    });

    const evidence = await new GithubDiagnosticProvider({
      owner: 'acme',
      repo: 'api',
      fetch: fetchMock as any,
    }).collectEvidence(failure(), options());
    const execution = evidence.items.find((item) => item.id === 'execution');
    expect(execution?.content).toContain('Repository: acme/api');
    expect(execution?.content).toContain('Workflow: Workflow');
    expect(execution?.source?.url).toBe('https://github.com/acme/api/actions/runs/1001');
  });
});
