import { describe, expect, it } from 'vitest';
import {
  chatCompletionsUrl,
  destinationFingerprint,
  modelsUrl,
  tokenizeUrl,
  validateEndpoint,
} from './endpoint-policy';

describe('endpoint policy', () => {
  it('allows loopback over http and normalizes the base path', () => {
    const result = validateEndpoint('http://127.0.0.1:8080');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.classification).toBe('loopback');
    expect(result.requiresConsent).toBe(false);
    expect(result.baseUrl).toBe('http://127.0.0.1:8080/v1');
  });

  it('allows localhost and IPv6 loopback', () => {
    expect(validateEndpoint('http://localhost:11434/v1').ok).toBe(true);
    expect(validateEndpoint('http://[::1]:8080/v1').ok).toBe(true);
  });

  it('requires https for remote and private destinations', () => {
    expect(validateEndpoint('http://api.example.com/v1')).toEqual({ ok: false, reason: 'https_required' });
    expect(validateEndpoint('https://api.example.com/v1').ok).toBe(true);
    expect(validateEndpoint('http://192.168.1.20:8080/v1')).toEqual({
      ok: false,
      reason: 'https_required',
    });
    expect(validateEndpoint('https://192.168.1.20:8080/v1').ok).toBe(true);
  });

  it('classifies private and remote destinations as consent-required', () => {
    const privateResult = validateEndpoint('https://10.1.2.3/v1');
    const remoteResult = validateEndpoint('https://api.example.com/v1');
    expect(privateResult.ok && privateResult.classification).toBe('private');
    expect(privateResult.ok && privateResult.requiresConsent).toBe(true);
    expect(remoteResult.ok && remoteResult.classification).toBe('remote');
    expect(remoteResult.ok && remoteResult.requiresConsent).toBe(true);
  });

  it('rejects credentials, unsupported schemes, queries and fragments', () => {
    expect(validateEndpoint('https://user:pass@example.com/v1')).toEqual({
      ok: false,
      reason: 'credentials_in_url',
    });
    expect(validateEndpoint('ftp://example.com/v1')).toEqual({ ok: false, reason: 'scheme_rejected' });
    expect(validateEndpoint('https://example.com/v1?key=1')).toEqual({
      ok: false,
      reason: 'query_or_fragment_rejected',
    });
    expect(validateEndpoint('not a url')).toEqual({ ok: false, reason: 'endpoint_invalid' });
  });

  it('builds OpenAI-compatible subpaths and destination fingerprints', () => {
    expect(chatCompletionsUrl('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1/chat/completions');
    expect(modelsUrl('http://127.0.0.1:8080/v1/')).toBe('http://127.0.0.1:8080/v1/models');
    expect(tokenizeUrl('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1/tokenize');
    expect(destinationFingerprint('https://example.com/v1', 'model')).not.toBe(
      destinationFingerprint('https://example.com/v1', 'other')
    );
  });
});
