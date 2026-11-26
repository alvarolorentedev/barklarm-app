import { FetchLike } from './providers/openai-compatible';

/**
 * Desktop inference must travel over Tauri's native HTTP client: the production
 * CSP only allows IPC, not arbitrary loopback ports. TLS is always validated
 * here; the observer `sslDisabled` compatibility switch must never reach it.
 */
export function createInferenceFetch(base: FetchLike): FetchLike {
  return (url, options) =>
    base(url, {
      ...(options || {}),
      redirect: 'manual',
      maxRedirections: 0,
    });
}

/** Observer integrations keep their opt-in SSL compatibility setting. */
export function createObserverFetch(base: FetchLike, sslDisabled: boolean | (() => boolean)): FetchLike {
  const disabled = typeof sslDisabled === 'function' ? sslDisabled : () => sslDisabled;
  return (url, options) =>
    base(url, {
      ...(options || {}),
      ...(disabled() ? { danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true } } : {}),
    });
}
