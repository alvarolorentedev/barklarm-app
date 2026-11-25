import { describe, expect, it, vi } from 'vitest';
import { DIAGNOSTIC_LIMITS } from '../../../core/diagnostics/limits';
import { normalizeEvidence } from '../../../core/diagnostics/normalize';
import { GithubDiagnosticProvider } from './provider';
import failedTestsInput from '../../../../fixtures/ai-eval/github-actions/failed-tests/input.json';
import failedTestsExpected from '../../../../fixtures/ai-eval/github-actions/failed-tests/expected.json';
import missingEnvInput from '../../../../fixtures/ai-eval/github-actions/missing-environment-variable/input.json';
import missingEnvExpected from '../../../../fixtures/ai-eval/github-actions/missing-environment-variable/expected.json';
import dependencyInput from '../../../../fixtures/ai-eval/github-actions/dependency-failure/input.json';
import dependencyExpected from '../../../../fixtures/ai-eval/github-actions/dependency-failure/expected.json';
import compilationInput from '../../../../fixtures/ai-eval/github-actions/compilation-error/input.json';
import compilationExpected from '../../../../fixtures/ai-eval/github-actions/compilation-error/expected.json';
import insufficientInput from '../../../../fixtures/ai-eval/github-actions/insufficient-evidence/input.json';
import insufficientExpected from '../../../../fixtures/ai-eval/github-actions/insufficient-evidence/expected.json';
import secretInput from '../../../../fixtures/ai-eval/github-actions/secret-exposure/input.json';
import secretExpected from '../../../../fixtures/ai-eval/github-actions/secret-exposure/expected.json';
import injectionInput from '../../../../fixtures/ai-eval/github-actions/prompt-injection/input.json';
import injectionExpected from '../../../../fixtures/ai-eval/github-actions/prompt-injection/expected.json';

const cases = [
  ['failed-tests', failedTestsInput, failedTestsExpected],
  ['missing-environment-variable', missingEnvInput, missingEnvExpected],
  ['dependency-failure', dependencyInput, dependencyExpected],
  ['compilation-error', compilationInput, compilationExpected],
  ['insufficient-evidence', insufficientInput, insufficientExpected],
  ['secret-exposure', secretInput, secretExpected],
  ['prompt-injection', injectionInput, injectionExpected],
] as Array<[string, any, any]>;

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  const map: Record<string, string> = {};
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

describe('GitHub Actions evaluation fixtures', () => {
  it.each(cases)('%s produces deterministic normalized evidence', async (_name, input, expected) => {
    const owner = input.observer.owner;
    const repo = input.observer.repo;
    const runId = input.api.runAttempt.id;
    const attempt = input.api.runAttempt.run_attempt;
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${base}/actions/runs/${runId}/attempts/${attempt}`) {
        return response(200, input.api.runAttempt);
      }
      if (url.includes(`/actions/runs/${runId}/attempts/${attempt}/jobs`)) {
        return response(200, input.api.jobs);
      }
      const logMatch = /\/actions\/jobs\/(\d+)\/logs$/.exec(url);
      if (logMatch) {
        const jobId = logMatch[1];
        if (input.api.logs[jobId] === null) return response(404, { message: 'Not Found' });
        return redirect(`https://productionresultssa1.blob.core.windows.net/logs/${jobId}?sig=synthetic`);
      }
      const downloadMatch = /\/logs\/(\d+)\?/.exec(url);
      if (downloadMatch) {
        return response(200, input.api.logs[downloadMatch[1]] ?? '');
      }
      throw new Error(`unexpected url ${url}`);
    });

    const draft = await new GithubDiagnosticProvider({
      owner,
      repo,
      authToken: input.observer.authToken,
      fetch: fetchMock as any,
    }).collectEvidence(
      {
        observerId: input.observer.id,
        sourceType: 'githubAction',
        failureId: input.failure.failureId,
        link: input.failure.link,
      },
      { signal: new AbortController().signal, limits: DIAGNOSTIC_LIMITS }
    );

    const evidence = normalizeEvidence(draft, {
      observerId: input.observer.id,
      failureId: input.failure.failureId,
      sourceType: 'githubAction',
      now: () => new Date('2026-01-15T17:00:00.000Z'),
      limits: DIAGNOSTIC_LIMITS,
      knownSecrets: [input.observer.authToken],
    });

    expect(evidence.completeness).toBe(expected.completeness);
    const ids = evidence.items.map((item) => item.id);
    for (const id of expected.requiredEvidence) expect(ids).toContain(id);
    for (const category of expected.requiredCategories) {
      expect(evidence.items.some((item) => item.category === category)).toBe(true);
    }
    for (const limitation of expected.limitations) expect(evidence.limitations).toContain(limitation);

    const serialized = JSON.stringify(evidence);
    for (const forbidden of expected.forbiddenStrings) expect(serialized).not.toContain(forbidden);
    for (const required of expected.requiredStrings || []) expect(serialized).toContain(required);
  });
});
