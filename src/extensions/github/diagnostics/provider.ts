import { FetchLike, fetchWrapper } from '../../fetch-adapter';
import {
  DiagnosticProvider,
  EvidenceCollectionOptions,
  EvidenceDraft,
  EvidenceItem,
  FailureReference,
} from '../../../types/Diagnostics';
import { extractLogExcerpts } from './log-extraction';

type JsonResult = { kind: 'ok'; data: unknown } | { kind: 'error'; limitation: string };

type BodyReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?: () => Promise<void>;
};

type ResponseLike = {
  ok?: boolean;
  status?: number;
  headers?: { get(name: string): string | null };
  body?: { getReader?: () => BodyReader; cancel?: () => Promise<void> } | null;
  text?: () => Promise<string>;
};

type Job = Record<string, unknown>;

type LogResult = {
  text?: string;
  limitation?: string;
};

export type GithubDiagnosticOptions = {
  owner: string;
  repo: string;
  authToken?: string;
  fetch?: FetchLike;
};

const FAILURE_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure'];
const FAILED_JOB_CONCLUSIONS = ['failure', 'timed_out'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function statusOf(response: ResponseLike | undefined): number {
  return typeof response?.status === 'number' ? response.status : 0;
}

function isOk(response: ResponseLike | undefined, status: number): boolean {
  return typeof response?.ok === 'boolean' ? response.ok : status >= 200 && status < 300;
}

function rateLimited(response: ResponseLike | undefined): boolean {
  const remaining = response?.headers?.get('x-ratelimit-remaining');
  return remaining === '0' || !!response?.headers?.get('retry-after');
}

function parseFailureId(value: string): { runId: number; attempt?: number } | undefined {
  const match = /^(\d+)(?::(\d+))?$/.exec(String(value ?? '').trim());
  if (!match) return undefined;
  const runId = Number(match[1]);
  const attempt = match[2] ? Number(match[2]) : undefined;
  if (!Number.isSafeInteger(runId) || runId <= 0) return undefined;
  if (attempt !== undefined && (!Number.isSafeInteger(attempt) || attempt <= 0)) return undefined;
  return { runId, attempt };
}

function allowedLogHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'github.com' || host.endsWith('.githubusercontent.com') || host.endsWith('.blob.core.windows.net');
}

function discard(response: ResponseLike | undefined): void {
  const cancel = response?.body?.cancel;
  if (!cancel) return;
  try {
    const result = cancel.call(response?.body);
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Cancelling a discarded body is best effort.
  }
}

async function readBody(
  response: ResponseLike | undefined,
  maxBytes: number
): Promise<{ text: string; tooLarge: boolean; truncated: boolean }> {
  const declared = Number(response?.headers?.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    discard(response);
    return { text: '', tooLarge: true, truncated: false };
  }

  const reader = response?.body?.getReader?.();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      const value = chunk.value;
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, Math.max(0, remaining)));
        total += Math.max(0, remaining);
        truncated = true;
        try {
          await reader.cancel?.();
        } catch {
          // The body is already bounded; cancellation is best effort.
        }
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(merged), tooLarge: false, truncated };
  }

  const text = typeof response?.text === 'function' ? await response.text() : '';
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > maxBytes) {
    return { text: new TextDecoder().decode(bytes.slice(0, maxBytes)), tooLarge: false, truncated: true };
  }
  return { text, tooLarge: false, truncated: false };
}

function line(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return `${label}: ${String(value)}`;
}

function content(lines: Array<string | undefined>): string {
  return lines.filter((value): value is string => !!value).join('\n');
}

/**
 * GitHub Actions evidence for one exact run attempt. It never calls the
 * latest-run endpoint, never downloads the workflow archive, and never follows a
 * redirect with credentials.
 */
export class GithubDiagnosticProvider implements DiagnosticProvider {
  readonly sourceType = 'githubAction';
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: GithubDiagnosticOptions) {
    this.fetchImpl = options.fetch ?? fetchWrapper;
  }

  async collectEvidence(failure: FailureReference, options: EvidenceCollectionOptions): Promise<EvidenceDraft> {
    const parsed = parseFailureId(failure.failureId);
    if (!parsed) {
      return this.unavailable(
        'invalid_failure_reference',
        'The failure reference is not a GitHub Actions run and attempt.'
      );
    }

    let attempt = parsed.attempt;
    if (!attempt) {
      const latest = await this.getJson(
        `/repos/${this.options.owner}/${this.options.repo}/actions/runs/${parsed.runId}`,
        options,
        'run'
      );
      if (latest.kind === 'error') return this.unavailable(latest.limitation);
      if (!isRecord(latest.data) || asNumber(latest.data.id) !== parsed.runId) {
        return this.unavailable('run_mismatch', 'GitHub returned a different workflow run.');
      }
      attempt = asNumber(latest.data.run_attempt) || 1;
    }

    const result = await this.getJson(
      `/repos/${this.options.owner}/${this.options.repo}/actions/runs/${parsed.runId}/attempts/${attempt}`,
      options,
      'run'
    );
    if (result.kind === 'error') return this.unavailable(result.limitation);
    const run = result.data;
    if (!isRecord(run) || asNumber(run.id) !== parsed.runId) {
      return this.unavailable('run_mismatch', 'GitHub returned a different workflow run.');
    }
    const returnedAttempt = asNumber(run.run_attempt);
    if (returnedAttempt !== undefined && returnedAttempt !== attempt) {
      return this.unavailable('run_mismatch', 'GitHub returned a different workflow run attempt.');
    }

    const status = asString(run.status);
    if (status && status !== 'completed') {
      return this.unavailable('run_incomplete', 'The workflow attempt has not completed.');
    }
    const conclusion = asString(run.conclusion);
    if (!conclusion) return this.unavailable('invalid_response', 'GitHub did not return a run conclusion.');
    if (!FAILURE_CONCLUSIONS.includes(conclusion)) {
      return this.unavailable(
        'non_failure_conclusion',
        `The workflow attempt concluded as "${conclusion}", which is not a diagnostic failure.`
      );
    }

    const limitations = new Set<string>();
    const jobsResult = await this.collectJobs(parsed.runId, attempt, options, limitations);
    if (jobsResult.unavailable && jobsResult.jobs.length === 0) {
      const item = this.executionItem(
        run,
        parsed.runId,
        attempt,
        { total: 0, failed: 0, cancelled: 0, succeeded: 0 },
        jobsResult.total
      );
      return this.partial(
        `Workflow run ${parsed.runId} attempt ${attempt} could not be fully diagnosed.`,
        [item],
        limitations
      );
    }

    const counts = this.jobCounts(jobsResult.jobs);
    const failedJobs = jobsResult.jobs
      .filter((job) => FAILED_JOB_CONCLUSIONS.includes(asString(job.conclusion) || ''))
      .slice(0, options.limits.maxFailedJobs);
    if (failedJobs.length < counts.failed) {
      limitations.add('failed_jobs_truncated');
    }
    if (jobsResult.truncated) limitations.add('jobs_truncated');

    const execution = this.executionItem(run, parsed.runId, attempt, counts, jobsResult.total);
    if (failedJobs.length === 0) {
      limitations.add('no_failed_jobs');
      return this.partial(
        `Workflow run ${parsed.runId} attempt ${attempt} failed but no failed job was returned.`,
        [execution],
        limitations
      );
    }

    const excerpts: EvidenceItem[] = [];
    const jobs: EvidenceItem[] = [];
    const steps: EvidenceItem[] = [];
    const logRequests = Math.min(failedJobs.length, options.limits.maxLogRequests);
    if (failedJobs.length > options.limits.maxLogRequests) limitations.add('log_requests_truncated');

    for (let index = 0; index < failedJobs.length; index += 1) {
      const job = failedJobs[index];
      const jobId = asNumber(job.id);
      const jobName = asString(job.name) || 'Unnamed job';
      if (!jobId) {
        limitations.add('invalid_job');
        continue;
      }
      const jobUrl = httpUrl(job.html_url) || this.runJobUrl(parsed.runId, jobId);
      const jobStarted = asString(job.started_at) || asString(job.created_at);
      const jobCompleted = asString(job.completed_at);
      const jobConclusion = asString(job.conclusion) || 'unknown';

      jobs.push({
        id: `job:${jobId}`,
        category: 'job',
        title: `Job: ${jobName}`,
        content: content([
          line('Job', jobName),
          line('Conclusion', jobConclusion),
          line('Job ID', jobId),
          line('Started', jobStarted),
          line('Completed', jobCompleted),
          line('URL', jobUrl),
        ]),
        source: { url: jobUrl, label: jobName },
        ...(jobStarted ? { timestamp: jobStarted } : {}),
        metadata: { jobId, conclusion: jobConclusion },
      });

      let failedSteps = 0;
      const rawSteps = Array.isArray(job.steps) ? job.steps : [];
      for (const rawStep of rawSteps) {
        if (!isRecord(rawStep)) {
          limitations.add('invalid_step');
          continue;
        }
        if (asString(rawStep.conclusion) !== 'failure') continue;
        const stepNumber = asNumber(rawStep.number);
        const stepName = asString(rawStep.name) || 'Unnamed step';
        if (stepNumber === undefined) {
          limitations.add('invalid_step');
          continue;
        }
        failedSteps += 1;
        const stepStarted = asString(rawStep.started_at);
        steps.push({
          id: `step:${jobId}:${stepNumber}`,
          category: 'step',
          title: `Step: ${stepName}`,
          content: content([
            line('Step', `${stepNumber}: ${stepName}`),
            line('Conclusion', 'failure'),
            line('Started', stepStarted),
            line('Completed', asString(rawStep.completed_at)),
          ]),
          source: { url: jobUrl, label: jobName },
          ...(stepStarted ? { timestamp: stepStarted } : {}),
          metadata: { jobId, stepNumber, conclusion: 'failure' },
        });
      }
      if (failedSteps === 0 && rawSteps.length === 0) limitations.add('job_steps_unavailable');

      if (index < logRequests) {
        const log = await this.getJobLog(jobId, options);
        if (log.limitation) limitations.add(log.limitation);
        if (log.text !== undefined) {
          const extraction = extractLog(jobName, jobId, log.text, jobUrl, jobStarted);
          extraction.items.forEach((item) => excerpts.push(item));
          extraction.limitations.forEach((limitation) => limitations.add(limitation));
        }
      }
    }

    const hasError = excerpts.some((item) => item.category === 'error');
    if (!hasError) limitations.add('no_error_signal');
    const partial = limitations.size > 0;
    const summary = `Workflow run ${parsed.runId} attempt ${attempt} failed: ${counts.failed} failed job(s), ${excerpts.length} excerpt(s) collected.${
      partial ? ' Evidence is partial; see limitations.' : ''
    }`;

    return {
      completeness: partial ? 'partial' : 'complete',
      summary,
      items: [execution, ...excerpts, ...jobs, ...steps],
      limitations: Array.from(limitations),
    };
  }

  private async collectJobs(
    runId: number,
    attempt: number,
    options: EvidenceCollectionOptions,
    limitations: Set<string>
  ): Promise<{ jobs: Job[]; total: number; truncated: boolean; unavailable: boolean }> {
    const jobs: Job[] = [];
    const seen = new Set<number>();
    let total = 0;
    let truncated = false;
    for (let page = 1; page <= options.limits.maxJobPages; page += 1) {
      const result = await this.getJson(
        `/repos/${this.options.owner}/${this.options.repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=${options.limits.jobsPerPage}&page=${page}`,
        options,
        'jobs'
      );
      if (result.kind === 'error') {
        limitations.add(result.limitation);
        return { jobs, total, truncated: true, unavailable: true };
      }
      if (!isRecord(result.data) || !Array.isArray(result.data.jobs)) {
        limitations.add('invalid_response');
        return { jobs, total, truncated: true, unavailable: true };
      }
      total = asNumber(result.data.total_count) || Math.max(total, result.data.jobs.length);
      for (const job of result.data.jobs) {
        if (!isRecord(job)) {
          limitations.add('invalid_job');
          continue;
        }
        const id = asNumber(job.id);
        if (!id || seen.has(id)) {
          limitations.add('invalid_job');
          continue;
        }
        seen.add(id);
        jobs.push(job);
      }
      if (result.data.jobs.length < options.limits.jobsPerPage) break;
      if (page * options.limits.jobsPerPage >= total) break;
      if (page === options.limits.maxJobPages) {
        truncated = true;
        limitations.add('jobs_truncated');
        break;
      }
    }
    if (jobs.length < total) {
      truncated = true;
      limitations.add('jobs_truncated');
    }
    return { jobs, total, truncated, unavailable: false };
  }

  private jobCounts(jobs: Job[]): { total: number; failed: number; cancelled: number; succeeded: number } {
    let failed = 0;
    let cancelled = 0;
    let succeeded = 0;
    for (const job of jobs) {
      const conclusion = asString(job.conclusion);
      if (conclusion === 'failure' || conclusion === 'timed_out') failed += 1;
      else if (conclusion === 'cancelled') cancelled += 1;
      else if (conclusion === 'success') succeeded += 1;
    }
    return { total: jobs.length, failed, cancelled, succeeded };
  }

  private executionItem(
    run: Record<string, unknown>,
    runId: number,
    attempt: number,
    counts: { total: number; failed: number; cancelled: number; succeeded: number },
    apiTotal: number
  ): EvidenceItem {
    const repository = isRecord(run.repository) ? asString(run.repository.full_name) : undefined;
    const url =
      httpUrl(run.html_url) || `https://github.com/${this.options.owner}/${this.options.repo}/actions/runs/${runId}`;
    const name = asString(run.name) || asString(run.display_title) || 'Workflow';
    const conclusion = asString(run.conclusion) || 'unknown';
    const branch = asString(run.head_branch);
    const sha = asString(run.head_sha);
    const event = asString(run.event);
    const createdAt = asString(run.created_at);
    const startedAt = asString(run.run_started_at);
    const updatedAt = asString(run.updated_at);
    return {
      id: 'execution',
      category: 'execution',
      title: `Workflow execution: ${name}`,
      content: content([
        line('Repository', repository || `${this.options.owner}/${this.options.repo}`),
        line('Workflow', name),
        line('Run', `${runId} (attempt ${attempt})`),
        line('Conclusion', conclusion),
        line('Branch', branch),
        line('Commit', sha),
        line('Event', event),
        line('Created', createdAt),
        line('Started', startedAt),
        line('Updated', updatedAt),
        line(
          'Jobs',
          `${Math.max(counts.total, apiTotal)} total; ${counts.failed} failed; ${counts.cancelled} cancelled; ${counts.succeeded} succeeded`
        ),
      ]),
      source: { url, label: name },
      ...(createdAt || startedAt ? { timestamp: createdAt || startedAt } : {}),
      metadata: {
        runId,
        runAttempt: attempt,
        conclusion,
        ...(branch ? { branch } : {}),
        ...(sha ? { commit: sha } : {}),
        ...(event ? { event } : {}),
      },
    };
  }

  private async getJobLog(jobId: number, options: EvidenceCollectionOptions): Promise<LogResult> {
    const response = await this.request(
      `https://api.github.com/repos/${this.options.owner}/${this.options.repo}/actions/jobs/${jobId}/logs`,
      {
        method: 'GET',
        headers: this.headers(),
        redirect: 'manual',
        maxRedirections: 0,
      },
      options
    );
    const status = statusOf(response);
    if (status === 401) {
      discard(response);
      return { limitation: 'auth_failed' };
    }
    if (status === 429 || (status === 403 && rateLimited(response))) {
      discard(response);
      return { limitation: 'rate_limited' };
    }
    if (status === 403) {
      discard(response);
      return { limitation: 'logs_unavailable' };
    }
    if (status === 404 || status === 410 || status === 451) {
      discard(response);
      return { limitation: 'logs_unavailable' };
    }
    if (status >= 500) {
      discard(response);
      throw new Error(`github logs ${status}`);
    }
    if (isOk(response, status) && status >= 200 && status < 300) {
      const body = await readBody(response, options.limits.maxResponseBytes);
      if (body.tooLarge) return { limitation: 'log_too_large' };
      return { text: body.text, ...(body.truncated ? { limitation: 'log_truncated' } : {}) };
    }
    if (status < 300 || status >= 400) {
      discard(response);
      return { limitation: 'logs_unavailable' };
    }

    const location = response?.headers?.get('location');
    discard(response);
    if (!location) return { limitation: 'redirect_rejected' };
    let target: URL;
    try {
      target = new URL(location);
    } catch {
      return { limitation: 'redirect_rejected' };
    }
    if (
      target.protocol !== 'https:' ||
      !!target.username ||
      !!target.password ||
      (!!target.port && target.port !== '443') ||
      !allowedLogHost(target.hostname)
    ) {
      return { limitation: 'redirect_rejected' };
    }

    const download = await this.request(
      target.href,
      { method: 'GET', headers: { Accept: 'text/plain' }, redirect: 'manual', maxRedirections: 0 },
      options
    );
    const downloadStatus = statusOf(download);
    if (downloadStatus >= 500) {
      discard(download);
      throw new Error(`github log download ${downloadStatus}`);
    }
    if (!isOk(download, downloadStatus) || downloadStatus < 200 || downloadStatus >= 300) {
      discard(download);
      return { limitation: 'redirect_rejected' };
    }
    const body = await readBody(download, options.limits.maxResponseBytes);
    if (body.tooLarge) return { limitation: 'log_too_large' };
    return { text: body.text, ...(body.truncated ? { limitation: 'log_truncated' } : {}) };
  }

  private async getJson(path: string, options: EvidenceCollectionOptions, scope: 'run' | 'jobs'): Promise<JsonResult> {
    const response = await this.request(
      `https://api.github.com${path}`,
      {
        method: 'GET',
        headers: this.headers(),
        redirect: 'manual',
        maxRedirections: 0,
      },
      options
    );
    const status = statusOf(response);
    if (status === 401) {
      discard(response);
      return { kind: 'error', limitation: 'auth_failed' };
    }
    if (status === 429 || (status === 403 && rateLimited(response))) {
      discard(response);
      return { kind: 'error', limitation: 'rate_limited' };
    }
    if (status === 403) {
      discard(response);
      return { kind: 'error', limitation: 'forbidden' };
    }
    if (status === 404 || status === 410 || status === 451) {
      discard(response);
      return { kind: 'error', limitation: scope === 'run' ? 'run_not_found' : 'jobs_unavailable' };
    }
    if (status >= 500) {
      discard(response);
      throw new Error(`github ${status}`);
    }
    if (!isOk(response, status) || status < 200 || status >= 300) {
      discard(response);
      return { kind: 'error', limitation: 'request_failed' };
    }
    const body = await readBody(response, options.limits.maxResponseBytes);
    if (body.tooLarge || body.truncated) return { kind: 'error', limitation: 'response_too_large' };
    try {
      return { kind: 'ok', data: JSON.parse(body.text) };
    } catch {
      return { kind: 'error', limitation: 'invalid_response' };
    }
  }

  private async request(
    url: string,
    init: Record<string, unknown>,
    options: EvidenceCollectionOptions
  ): Promise<ResponseLike> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), options.limits.requestTimeoutMs);
    try {
      return (await this.fetchImpl(url, { ...init, signal: controller.signal })) as ResponseLike;
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.options.authToken) headers.Authorization = `Bearer ${this.options.authToken}`;
    return headers;
  }

  private runJobUrl(runId: number, jobId: number): string {
    return `https://github.com/${this.options.owner}/${this.options.repo}/actions/runs/${runId}/job/${jobId}`;
  }

  private unavailable(limitation: string, summary?: string): EvidenceDraft {
    return {
      completeness: 'unavailable',
      summary: `Evidence unavailable: ${summary || UNAVAILABLE_MESSAGES[limitation] || limitation}.`,
      items: [],
      limitations: [limitation],
    };
  }

  private partial(summary: string, items: EvidenceItem[], limitations: Set<string>): EvidenceDraft {
    return {
      completeness: 'partial',
      summary: `${summary} Evidence is partial; see limitations.`,
      items,
      limitations: Array.from(limitations),
    };
  }
}

const UNAVAILABLE_MESSAGES: Record<string, string> = {
  invalid_failure_reference: 'the failure reference is not a GitHub Actions run and attempt',
  auth_failed: 'GitHub rejected the configured credentials',
  forbidden: 'the configured credentials cannot read this workflow',
  rate_limited: 'GitHub rate-limited the diagnostic request',
  run_not_found: 'GitHub did not return the requested workflow run attempt',
  run_mismatch: 'GitHub returned a different workflow run or attempt',
  run_incomplete: 'the workflow attempt has not completed',
  non_failure_conclusion: 'the workflow attempt is not a diagnostic failure',
  response_too_large: 'the GitHub response exceeded the diagnostic limit',
  invalid_response: 'GitHub returned an unexpected response shape',
  request_failed: 'the GitHub request failed',
  jobs_unavailable: 'GitHub job metadata could not be retrieved',
  logs_unavailable: 'GitHub job logs could not be retrieved',
};

function extractLog(
  jobName: string,
  jobId: number,
  text: string,
  jobUrl: string,
  jobStarted: string | undefined
): { items: EvidenceItem[]; limitations: string[] } {
  const result = extractLogExcerpts(text);
  const items = result.excerpts.map((excerpt, index) => {
    const id = `${excerpt.category === 'error' ? 'error' : 'log'}:${jobId}:${index}`;
    return {
      id,
      category: excerpt.category,
      title: `${excerpt.category === 'error' ? 'Error' : 'Log'} excerpt from ${jobName}`,
      content: excerpt.lines.join('\n'),
      source: { url: jobUrl, label: jobName },
      ...(excerpt.timestamp || jobStarted ? { timestamp: excerpt.timestamp || jobStarted } : {}),
      metadata: {
        jobId,
        signal: excerpt.signal,
        startLine: excerpt.startLine,
        endLine: excerpt.endLine,
      },
      ...(excerpt.truncated
        ? {
            truncation: {
              truncated: true as const,
              originalLength: excerpt.originalLength,
              returnedLength: excerpt.returnedLength,
              reason: 'log_excerpt_limit',
            },
          }
        : {}),
    } as EvidenceItem;
  });
  return { items, limitations: result.limitations };
}
