import "server-only";

import { CLIENT_IP_HEADER, PROXY_AUTH_HEADER, stampProxyClientIp } from "@repo/shared/proxy-client-ip";
import { headers } from "next/headers";
import { cache } from "react";
import { serviceUrl } from "@/lib/http/service-routes";

// The ONE way a server-rendered ERP page reads the service. It forwards what
// the browser sent (cookie, RSC, next-action, accept-language, x-request-id)
// and stamps the client IP + proxy-auth exactly as proxy.ts does for /api, so
// the service sees the same caller whether the request came through a rewrite
// or through a page. Nothing here is cached beyond the render: `no-store` on
// the fetch, and React's cache() only dedupes the same read within one request.

const FORWARDED_HEADERS = ["cookie", "rsc", "next-action", "accept-language", "x-request-id"] as const;

export type ServiceResult<T> = { status: number; data: T | null };

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message?: string,
  ) {
    super(message ?? `service ${path} answered ${status}`);
    this.name = "ServiceError";
  }
}

export type ServiceGetOptions = {
  // The sitemap is prerendered: it has no request headers to forward and reads
  // as an anonymous caller, exactly as its cookie-less DB read did.
  anonymous?: boolean;
};

type Query = Record<string, string | number | boolean | null | undefined>;

async function buildHeaders(anonymous: boolean): Promise<Headers> {
  const out = new Headers();
  if (!anonymous) {
    // headers() is read-only; the stamp reads the platform/XFF headers from a
    // mutable copy of the whole request, the same input proxy.ts gives it.
    const incoming = new Headers(await headers());
    for (const name of FORWARDED_HEADERS) {
      const v = incoming.get(name);
      if (v !== null) out.set(name, v);
    }
    stampProxyClientIp(incoming, process.env.EDURA_PROXY_SECRET);
    for (const name of [CLIENT_IP_HEADER, PROXY_AUTH_HEADER]) {
      const v = incoming.get(name);
      if (v !== null) out.set(name, v);
    }
  }
  out.set("accept", "application/json");
  return out;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function serviceGetUncached<T>(pathWithQuery: string, anonymous: boolean): Promise<ServiceResult<T>> {
  const url = `${serviceUrl()}${pathWithQuery}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: await buildHeaders(anonymous),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (err) {
    throw new ServiceError(0, pathWithQuery, `service ${pathWithQuery} unreachable: ${String(err)}`);
  }
  if (res.status >= 500 || res.status < 200 || (res.status >= 300 && res.status < 400)) {
    throw new ServiceError(res.status, pathWithQuery);
  }
  // Every 4xx is the caller's decision (today's AppError → its status): the
  // page maps 401 to its login redirect and 403/404 to notFound / login.
  if (res.status >= 400) return { status: res.status, data: null };
  const body = (await res.json()) as { data: T };
  return { status: res.status, data: body.data };
}

// Keyed by the serialised URL + caller mode: two components reading the same
// path in one render share one round-trip; a different request starts fresh.
const serviceGetCached = cache(<T>(pathWithQuery: string, anonymous: boolean) =>
  serviceGetUncached<T>(pathWithQuery, anonymous),
);

export function serviceGet<T>(path: string, query?: Query, opts?: ServiceGetOptions): Promise<ServiceResult<T>> {
  return serviceGetCached<T>(withQuery(path, query), opts?.anonymous === true);
}
