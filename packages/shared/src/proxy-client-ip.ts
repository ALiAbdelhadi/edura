import { trustedClientIp } from "./client-ip";

// docs/decisions/backend-separation.md, "Client IP". The frontend's proxy sits
// on the platform that knows the real client IP; the service behind a rewrite
// does not, and cannot tell a rewrite hop from a browser. So the proxy stamps
// the IP it trusts into CLIENT_IP_HEADER and vouches for it with a shared
// secret in PROXY_AUTH_HEADER. Both names are deleted from whatever the browser
// sent BEFORE stamping, so an inbound copy never survives to the service.
//
// This file is the proxy side and is import-light on purpose: it must not drag
// the Redis limiter or node:crypto into apps/erp/src/proxy.ts. The service
// side (verification) is @repo/server-core/http/proxy-client-ip-trust.ts.
export const CLIENT_IP_HEADER = "x-edura-client-ip";
export const PROXY_AUTH_HEADER = "x-edura-proxy-auth";

export function stampProxyClientIp(headers: Headers, secret: string | undefined): void {
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_AUTH_HEADER);
  const s = secret?.trim();
  if (!s) return;
  headers.set(CLIENT_IP_HEADER, trustedClientIp((n) => headers.get(n)));
  headers.set(PROXY_AUTH_HEADER, s);
}
