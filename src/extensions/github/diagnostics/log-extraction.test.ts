import { describe, expect, it } from 'vitest';
import { extractLogExcerpts } from './log-extraction';

describe('extractLogExcerpts', () => {
  it('selects GitHub error annotations with context', () => {
    const result = extractLogExcerpts('step start\ninstalling\n##[error]Process completed with exit code 1.\ncleanup');

    expect(result.limitations).toEqual([]);
    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0]).toMatchObject({
      category: 'error',
      signal: 'github-annotation',
      startLine: 1,
    });
    expect(result.excerpts[0].lines.join('\n')).toContain('Process completed with exit code 1.');
    expect(result.excerpts[0].lines.join('\n')).toContain('installing');
  });

  it('recognizes a timestamped GitHub annotation', () => {
    const result = extractLogExcerpts('2026-01-15T10:00:00.1234567Z ##[error]Process completed with exit code 1.');

    expect(result.excerpts[0].signal).toBe('github-annotation');
  });

  it('finds compilation errors', () => {
    const result = extractLogExcerpts("src/app.ts(12,5): error TS2322: Type 'string' is not assignable to 'number'.");

    expect(result.excerpts[0]).toMatchObject({ category: 'error', signal: 'compile-error' });
  });

  it('finds test failures and stack context', () => {
    const result = extractLogExcerpts(
      ['collected 1 item', 'tests/test_math.py F', 'E   AssertionError: assert 3 == 4', 'Done'].join('\n')
    );

    expect(result.excerpts[0].signal).toBe('test-failure');
    expect(result.excerpts[0].lines.join('\n')).toContain('AssertionError');
  });

  it('finds dependency installation errors', () => {
    const result = extractLogExcerpts('npm ERR! code ERESOLVE\nnpm ERR! Could not resolve dependency: peer react@18');

    expect(result.excerpts[0].signal).toBe('dependency-error');
    expect(result.excerpts[0].lines.join('\n')).toContain('ERESOLVE');
  });

  it('does not treat the last log line as the failure', () => {
    const result = extractLogExcerpts('starting\nall checks passed\nDone in 4.2s');

    expect(result.limitations).toContain('no_error_signal');
    expect(result.excerpts[0].category).toBe('log');
    expect(result.excerpts[0].signal).toBe('no-signal');
  });

  it('distinguishes an empty log', () => {
    expect(extractLogExcerpts('   \n')).toEqual({ excerpts: [], limitations: ['log_empty'] });
  });

  it('strips terminal control sequences before extraction', () => {
    const result = extractLogExcerpts('\u001b[31mError: database unavailable\u001b[0m');

    expect(result.excerpts[0].lines.join('\n')).toBe('Error: database unavailable');
  });

  it('bounds excerpt content and reports truncation', () => {
    const result = extractLogExcerpts(`${'x'.repeat(200)}\nError: boom\n${'y'.repeat(200)}`, {
      maxExcerpts: 2,
      contextBefore: 0,
      contextAfter: 2,
      maxChars: 40,
      maxLines: 100,
    });

    expect(result.excerpts[0].truncated).toBe(true);
    expect(result.excerpts[0].returnedLength).toBe(40);
    expect(result.limitations).toContain('log_truncated');
  });

  it('limits the number of excerpts', () => {
    const lines = Array.from({ length: 30 }, (_, index) =>
      index % 6 === 0 ? `Error: failure ${index}` : `line ${index}`
    );
    const result = extractLogExcerpts(lines.join('\n'), {
      maxExcerpts: 2,
      contextBefore: 0,
      contextAfter: 0,
      maxChars: 1600,
      maxLines: 100,
    });

    expect(result.excerpts).toHaveLength(2);
  });

  it('extracts a timestamp from GitHub log lines', () => {
    const result = extractLogExcerpts('2026-01-15T10:00:00.1234567Z Error: boom');

    expect(result.excerpts[0].timestamp).toBe('2026-01-15T10:00:00.1234567Z');
  });
});
