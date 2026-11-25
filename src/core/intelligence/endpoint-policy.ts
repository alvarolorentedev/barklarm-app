import { hashString } from './fingerprint';

export type EndpointClass = 'loopback' | 'private' | 'remote';

export type EndpointValidation =
  | {
      ok: true;
      baseUrl: string;
      origin: string;
      classification: EndpointClass;
      requiresConsent: boolean;
      fingerprintSeed: string;
    }
  | { ok: false; reason: string };

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isPrivate(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '::1' || host.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^f[cd][0-9a-f]{0,2}:/i.test(host) || /^fe[89ab][0-9a-f]?:/i.test(host)) return true;
  return false;
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return '/v1';
  if (trimmed.endsWith('/v1')) return trimmed;
  return trimmed;
}

/** Classifies a user-configured base URL before any evidence can leave the app. */
export function validateEndpoint(raw: unknown): EndpointValidation {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'endpoint_missing' };
  const value = raw.trim();
  if (value.length > 2048) return { ok: false, reason: 'endpoint_too_long' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'endpoint_invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'scheme_rejected' };
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url' };
  if (url.search || url.hash) return { ok: false, reason: 'query_or_fragment_rejected' };
  if (!url.hostname) return { ok: false, reason: 'endpoint_invalid' };

  const loopback = isLoopback(url.hostname);
  const classification: EndpointClass = loopback ? 'loopback' : isPrivate(url.hostname) ? 'private' : 'remote';
  if (!loopback && url.protocol !== 'https:') return { ok: false, reason: 'https_required' };

  url.pathname = normalizePath(url.pathname);
  const baseUrl = url.toString().replace(/\/$/, '');
  return {
    ok: true,
    baseUrl,
    origin: url.origin,
    classification,
    requiresConsent: classification !== 'loopback',
    fingerprintSeed: `${url.origin}${url.pathname}`,
  };
}

export function destinationFingerprint(baseUrl: string, model: string): string {
  return hashString(`${baseUrl}|${String(model || '').trim()}`);
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

export function tokenizeUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/tokenize`;
}

export function isLoopbackEndpoint(baseUrl: string): boolean {
  const validation = validateEndpoint(baseUrl);
  return validation.ok && validation.classification === 'loopback';
}
