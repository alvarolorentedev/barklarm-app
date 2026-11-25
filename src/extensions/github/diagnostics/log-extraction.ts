export type LogExcerpt = {
  category: 'error' | 'log';
  signal: string;
  lines: string[];
  startLine: number;
  endLine: number;
  timestamp?: string;
  truncated: boolean;
  originalLength: number;
  returnedLength: number;
};

export type LogExtractionOptions = {
  maxExcerpts: number;
  contextBefore: number;
  contextAfter: number;
  maxChars: number;
  maxLines: number;
};

export type LogExtractionResult = {
  excerpts: LogExcerpt[];
  limitations: string[];
};

export const DEFAULT_LOG_EXTRACTION: LogExtractionOptions = {
  maxExcerpts: 3,
  contextBefore: 2,
  contextAfter: 6,
  maxChars: 1600,
  maxLines: 20000,
};

/* eslint-disable no-control-regex -- terminal sequences are stripped before extraction */
const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC = /\u001b\][^\u0007\n]*(?:\u0007|\u001b\\)/g;
const ANSI_SHORT = /\u001b[@-_]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const BIDI = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

type Candidate = {
  index: number;
  score: number;
  signal: string;
};

function cleanLog(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OSC, '')
    .replace(ANSI_SHORT, '')
    .replace(CONTROL, '')
    .replace(BIDI, '');
}

function match(line: string): { score: number; signal: string } | undefined {
  const trimmed = line.trim();
  if (/^##\[error\]/i.test(trimmed) || /::error\b/.test(trimmed)) return { score: 10, signal: 'github-annotation' };
  if (/\berror TS\d+/.test(trimmed) || /\berror\[E\d+\]/.test(trimmed)) return { score: 8, signal: 'compile-error' };
  if (/^(?:FAILED|FAIL)\b/.test(trimmed) || /^\s*E\s{2,}/.test(line) || /\bAssertionError\b/.test(trimmed)) {
    return { score: 7, signal: 'test-failure' };
  }
  if (
    /\b(?:npm|pnpm|yarn) ERR!/.test(trimmed) ||
    /\bERR_[A-Z_]+\b/.test(trimmed) ||
    /\b(?:Could not resolve|No matching distribution|Cannot find module|ModuleNotFoundError)\b/.test(trimmed)
  ) {
    return { score: 7, signal: 'dependency-error' };
  }
  if (
    /\b(?:fatal|panic)\b/i.test(trimmed) ||
    /\b(?:error|exception)\s*[:[(]/i.test(trimmed) ||
    /^error\b/i.test(trimmed) ||
    /\b[A-Za-z]*Error\s*:/.test(trimmed) ||
    /\b[A-Za-z]*Exception\s*:/.test(trimmed)
  ) {
    return { score: 6, signal: 'error' };
  }
  if (/\b(?:Segmentation fault|SIGSEGV|core dumped)\b/i.test(trimmed)) return { score: 6, signal: 'crash' };
  if (/\b(?:401 Unauthorized|403 Forbidden)\b/i.test(trimmed)) return { score: 5, signal: 'http-error' };
  if (/\b(?:Connection refused|ETIMEDOUT|EACCES|ENOENT)\b/.test(trimmed)) return { score: 5, signal: 'system-error' };
  if (/\bexit(?:ed)? (?:with )?(?:code|status)\s*[:=]?\s*[1-9]\d*/i.test(trimmed)) {
    return { score: 4, signal: 'exit-code' };
  }
  if (
    /^Traceback \(most recent call last\)/.test(trimmed) ||
    /^Caused by:/.test(trimmed) ||
    /^\s+at\s+\S+/.test(line) ||
    /^\s*File "[^"]+", line \d+/.test(line)
  ) {
    return { score: 3, signal: 'stack-trace' };
  }
  return undefined;
}

function timestampFor(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\s/.exec(line.trim());
    if (match) return match[1];
  }
  return undefined;
}

function buildExcerpt(
  lines: string[],
  start: number,
  end: number,
  category: 'error' | 'log',
  signal: string,
  maxChars: number
): LogExcerpt {
  const window = lines.slice(start, end + 1);
  const joined = window.join('\n');
  const truncated = joined.length > maxChars;
  const text = truncated ? joined.slice(0, maxChars) : joined;
  return {
    category,
    signal,
    lines: text.split('\n'),
    startLine: start + 1,
    endLine: end + 1,
    timestamp: timestampFor(window),
    truncated,
    originalLength: joined.length,
    returnedLength: text.length,
  };
}

/**
 * Deterministic error extraction. It never assumes the last line is the failure;
 * if no signal matches it returns bounded head/tail context and says so.
 */
export function extractLogExcerpts(
  log: string,
  options: LogExtractionOptions = DEFAULT_LOG_EXTRACTION
): LogExtractionResult {
  const limitations = new Set<string>();
  const cleaned = cleanLog(String(log ?? ''));
  if (!cleaned.trim()) return { excerpts: [], limitations: ['log_empty'] };

  let lines = cleaned.split('\n');
  if (lines.length > options.maxLines) {
    lines = lines.slice(0, options.maxLines);
    limitations.add('log_truncated');
  }

  const candidates: Candidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const matched = match(lines[index].slice(0, 2000));
    if (matched) candidates.push({ index, ...matched });
  }

  const excerpts: LogExcerpt[] = [];
  if (candidates.length > 0) {
    const selected = candidates
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, options.maxExcerpts)
      .map((candidate) => ({
        start: Math.max(0, candidate.index - options.contextBefore),
        end: Math.min(lines.length - 1, candidate.index + options.contextAfter),
        score: candidate.score,
        signal: candidate.signal,
      }))
      .sort((left, right) => left.start - right.start);

    const merged: typeof selected = [];
    for (const window of selected) {
      const previous = merged[merged.length - 1];
      if (previous && window.start <= previous.end + 1) {
        previous.end = Math.max(previous.end, window.end);
        if (window.score > previous.score) {
          previous.score = window.score;
          previous.signal = window.signal;
        }
      } else {
        merged.push({ ...window });
      }
    }

    for (const window of merged) {
      excerpts.push(buildExcerpt(lines, window.start, window.end, 'error', window.signal, options.maxChars));
    }
  } else {
    limitations.add('no_error_signal');
    const headEnd = Math.min(lines.length - 1, 9);
    excerpts.push(buildExcerpt(lines, 0, headEnd, 'log', 'no-signal', options.maxChars));
    if (lines.length > 20) {
      excerpts.push(buildExcerpt(lines, lines.length - 10, lines.length - 1, 'log', 'no-signal', options.maxChars));
    }
  }

  if (excerpts.some((excerpt) => excerpt.truncated)) limitations.add('log_truncated');
  return { excerpts, limitations: Array.from(limitations) };
}
