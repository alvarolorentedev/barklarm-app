export type FetchLike = (url: string, options?: any) => Promise<any>;

const defaultFetch: FetchLike = (url, options) => fetch(url, options);
let implementation: FetchLike = defaultFetch;

export function setFetchImplementation(next: FetchLike): void {
  implementation = next;
}

export function resetFetchImplementation(): void {
  implementation = defaultFetch;
}

export const fetchWrapper: FetchLike = (url, options) => implementation(url, options);
