import { describe, expect, it } from 'vitest';
import { Status } from '../types/Status';
import { buildIssuePayload, isHttpUrl } from './issue';

describe('issue payload', () => {
  it('only transmits allowlisted fields', () => {
    const payload = buildIssuePayload({
      id: 'observer-1',
      name: 'API build',
      status: Status.FAILURE,
      link: 'https://example.test/run/1',
      muted: true,
      issueEndpoint: 'https://hooks.example.test/issue',
      error: { id: 'run-1', description: 'Workflow failed', actions: [{ label: 'Retry' }] },
      futureEvidence: 'must not leak',
    } as any);

    expect(payload).toEqual({
      name: 'API build',
      status: Status.FAILURE,
      link: 'https://example.test/run/1',
      error: {
        id: 'run-1',
        description: 'Workflow failed',
        actions: [{ label: 'Retry' }],
      },
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('muted');
    expect(payload).not.toHaveProperty('issueEndpoint');
    expect(payload).not.toHaveProperty('futureEvidence');
  });

  it('omits the error block when there is no evidence', () => {
    const payload = buildIssuePayload({ name: 'Job', status: Status.SUCCESS, link: '' });

    expect(payload).not.toHaveProperty('error');
  });

  it('never transmits diagnostic evidence', () => {
    const payload = buildIssuePayload({
      name: 'API build',
      status: Status.FAILURE,
      link: 'https://example.test/run/1',
      error: { id: 'run-1:1', description: 'Workflow failed' },
      diagnosticEvidence: { items: [{ content: 'secret log excerpt' }] },
      evidence: { items: [{ content: 'must not leak' }] },
    } as any);

    expect(payload).toEqual({
      name: 'API build',
      status: Status.FAILURE,
      link: 'https://example.test/run/1',
      error: { id: 'run-1:1', description: 'Workflow failed' },
    });
  });

  it('accepts only HTTP and HTTPS endpoints', () => {
    expect(isHttpUrl('https://hooks.example.test/issue')).toBe(true);
    expect(isHttpUrl('http://localhost:8080/issue')).toBe(true);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});
