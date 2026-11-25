import { describe, expect, it } from 'vitest';
import { collectKnownSecrets, REDACTED, sanitizeText, stripUnsafeText } from './sanitize';

const githubToken = `ghp_${'A'.repeat(24)}`;

describe('stripUnsafeText', () => {
  it('removes ANSI, OSC, control and bidi sequences but keeps newlines', () => {
    const input = `a\u001b[31mb\u001b[0m\u0007c\u001b]0;title\u0007d\u202Ee\r\nnext`;
    expect(stripUnsafeText(input)).toBe('abcde\nnext');
  });
});

describe('sanitizeText', () => {
  it('leaves clean text untouched', () => {
    expect(sanitizeText('npm ERR! code ERESOLVE')).toEqual({ text: 'npm ERR! code ERESOLVE', redacted: false });
  });

  it('redacts authorization headers and bearer values', () => {
    const result = sanitizeText(`Authorization: Bearer ${githubToken}\nnext`);
    expect(result.text).not.toContain(githubToken);
    expect(result.text).toContain(REDACTED);
    expect(result.redacted).toBe(true);
  });

  it('redacts known GitHub token shapes', () => {
    const result = sanitizeText(`token ${githubToken} leaked`);
    expect(result.text).not.toContain(githubToken);
    expect(result.text).toContain(REDACTED);
  });

  it('redacts quoted and unquoted password assignments', () => {
    const result = sanitizeText('password = "s3cr3t-value"\nDB_PASSWORD=hunter2');
    expect(result.text).not.toContain('s3cr3t-value');
    expect(result.text).not.toContain('hunter2');
    expect(result.redacted).toBe(true);
  });

  it('redacts JSON and quoted credential assignments', () => {
    const basic = 'Basic dXNlcjpwYXNzd29yZA==';
    const result = sanitizeText(
      `{"Authorization": "${basic}", "password": "hunter2", "token": "abc123", 'secret': 'shh'}`,
      []
    );

    expect(result.text).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(result.text).not.toContain('hunter2');
    expect(result.text).not.toContain('abc123');
    expect(result.text).not.toContain('shh');
    expect(result.text).toContain('[REDACTED]');
    expect(result.redacted).toBe(true);
  });

  it('redacts credentials embedded in URLs', () => {
    const result = sanitizeText('https://user:supersecret@example.test/repo');
    expect(result.text).not.toContain('supersecret');
    expect(result.text).toContain('https://[REDACTED]@example.test/repo');
  });

  it('redacts private key blocks and JWTs', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz';
    const result = sanitizeText(`${pem}\n${jwt}`);
    expect(result.text).not.toContain('MIIEow');
    expect(result.text).not.toContain(jwt);
    expect(result.text).toContain('[REDACTED PRIVATE KEY]');
  });

  it('redacts configured credential values exactly and URL-encoded', () => {
    const secret = 'configured/secret value';
    const result = sanitizeText(`raw=${secret} encoded=${encodeURIComponent(secret)}`, [secret]);
    expect(result.text).not.toContain(secret);
    expect(result.text).not.toContain(encodeURIComponent(secret));
    expect(result.redacted).toBe(true);
  });
});

describe('collectKnownSecrets', () => {
  it('finds credential-named values and ignores aliases and short values', () => {
    const secrets = collectKnownSecrets({
      alias: 'production',
      authToken: githubToken,
      apiKey: 'api-key-value',
      short: 'abc',
      nested: { appKey: 'app-key-value' },
    });

    expect(secrets).toEqual(expect.arrayContaining([githubToken, 'api-key-value', 'app-key-value']));
    expect(secrets).not.toContain('production');
    expect(secrets).not.toContain('abc');
  });

  it('walks arrays and nested credential objects', () => {
    const token = `ghp_${'E'.repeat(24)}`;
    expect(collectKnownSecrets([{ authToken: token }, { nested: [{ apiKey: 'nested-key-value' }] }])).toEqual(
      expect.arrayContaining([token, 'nested-key-value'])
    );
  });
});
