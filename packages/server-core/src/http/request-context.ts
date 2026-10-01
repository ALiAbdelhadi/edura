import { AsyncLocalStorage } from "node:async_hooks";

// The incoming request's headers, for code that is not handed the Request.
// A service host binds them per request with runWithRequestHeaders; a Next app
// registers `headers()` from next/headers as the source instead.
export type RequestHeaders = { get(name: string): string | null };
export type RequestHeadersSource = () => Promise<RequestHeaders>;

type RequestScope = { headers: RequestHeaders; memo: Map<object, unknown> };

const store = new AsyncLocalStorage<RequestScope>();
let source: RequestHeadersSource | null = null;

export function setRequestHeadersSource(next: RequestHeadersSource): void {
  source = next;
}

export function runWithRequestHeaders<T>(headers: RequestHeaders, fn: () => T): T {
  return store.run({ headers, memo: new Map() }, fn);
}

export async function requestHeaders(): Promise<RequestHeaders> {
  const bound = store.getStore();
  if (bound) return bound.headers;
  if (source) return source();
  throw new Error("requestHeaders() called outside a request");
}

// One result per request for a zero-argument function: inside a
// runWithRequestHeaders scope the scope's own map holds it; a Next app registers
// React's `cache` instead, which dedups within one render the same way. Outside
// both it is a plain call, so unit tests see no memo at all. The registered
// wrapper is applied lazily because the host binds it after this module loads.
export type RequestMemo = <T>(fn: () => T) => () => T;

let memoSource: RequestMemo | null = null;

export function setRequestMemo(next: RequestMemo): void {
  memoSource = next;
}

export function requestMemo<T>(fn: () => T): () => T {
  const key = {};
  let wrapped: { by: RequestMemo; fn: () => T } | null = null;
  return () => {
    const scope = store.getStore();
    if (scope) {
      if (!scope.memo.has(key)) scope.memo.set(key, fn());
      return scope.memo.get(key) as T;
    }
    if (!memoSource) return fn();
    if (!wrapped || wrapped.by !== memoSource) wrapped = { by: memoSource, fn: memoSource(fn) };
    return wrapped.fn();
  };
}
