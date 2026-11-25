/* eslint-disable no-control-regex -- control sequences are exactly what must be stripped */
export const REDACTED = '[REDACTED]';

export type SanitizedText = {
  text: string;
  redacted: boolean;
};

const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC = /\u001b\][^\u0007\n]*(?:\u0007|\u001b\\)/g;
const ANSI_SHORT = /\u001b[@-_]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const BIDI = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|app[_-]?key|auth[_-]?key|access[_-]?key)/i;

/** Removes terminal and direction-control sequences that could spoof rendered evidence. */
export function stripUnsafeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OSC, '')
    .replace(ANSI_SHORT, '')
    .replace(CONTROL, '')
    .replace(BIDI, '');
}

/**
 * Redacts recognizable credentials and configured values. This is a safety net,
 * not a proof: encoded or unrecognized secrets can survive (see SECURITY.md).
 */
export function sanitizeText(value: string, knownSecrets: string[] = []): SanitizedText {
  let text = stripUnsafeText(String(value ?? ''));
  let redacted = false;

  const apply = (pattern: RegExp, replacement: string): void => {
    const next = text.replace(pattern, replacement);
    if (next !== text) redacted = true;
    text = next;
  };

  const secrets = new Set<string>();
  for (const secret of knownSecrets) {
    const trimmed = String(secret ?? '').trim();
    if (trimmed.length < 4) continue;
    secrets.add(trimmed);
    const encoded = encodeURIComponent(trimmed);
    if (encoded !== trimmed && encoded.length >= 4) secrets.add(encoded);
  }
  for (const secret of secrets) {
    if (!text.includes(secret)) continue;
    text = text.split(secret).join(REDACTED);
    redacted = true;
  }

  apply(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
  apply(/(authorization\s*[:=]\s*)(?:bearer|basic|token)?\s*[^\s,;]+/gi, `$1${REDACTED}`);
  apply(/(proxy-authorization\s*[:=]\s*)[^\s,;]+/gi, `$1${REDACTED}`);
  apply(/(x-api-key\s*:\s*)[^\s,;]+/gi, `$1${REDACTED}`);
  apply(/((?:set-)?cookie\s*:\s*)[^\n]+/gi, `$1${REDACTED}`);
  apply(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`);
  apply(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED);
  apply(/\bAKIA[0-9A-Z]{16}\b/g, REDACTED);
  apply(/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g, REDACTED);
  apply(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED);
  apply(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, `$1${REDACTED}@`);
  apply(
    /\b([A-Za-z0-9_.-]{0,64}(?:token|secret|password|passwd|api[_-]?key|app[_-]?key|auth[_-]?key|access[_-]?key)[A-Za-z0-9_.-]{0,64})\s*[:=]\s*["']([^"']{4,})["']/gi,
    `$1=${REDACTED}`
  );
  apply(
    /\b([A-Za-z0-9_.-]{0,64}(?:token|secret|password|passwd|api[_-]?key|app[_-]?key|auth[_-]?key|access[_-]?key)[A-Za-z0-9_.-]{0,64})\s*[:=]\s*([^\s"',;]{4,})/gi,
    `$1=${REDACTED}`
  );

  return { text, redacted };
}

/**
 * Collects configured credential values so they can be removed exactly, even when
 * they do not match a generic pattern. Values never leave this trusted boundary.
 */
export function collectKnownSecrets(config: unknown): string[] {
  const found = new Set<string>();

  const visit = (value: unknown, depth: number): void => {
    if (depth > 3 || found.size >= 10 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string' && SECRET_KEY.test(key) && child.trim().length >= 4) {
        found.add(child);
      } else if (child && typeof child === 'object') {
        visit(child, depth + 1);
      }
    }
  };

  visit(config, 0);
  return Array.from(found);
}
