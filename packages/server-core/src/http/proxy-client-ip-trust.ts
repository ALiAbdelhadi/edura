import { secretEquals } from "../auth/secret-compare";
import { normalizeIp, trustedClientIp } from "../rate-limit/client-ip";
import { CLIENT_IP_HEADER, PROXY_AUTH_HEADER } from "./proxy-client-ip";

export type ProxiedClientIp = {
  ip: string;
  vouched: boolean;
  headers: Headers;
};

// Service side of ./proxy-client-ip.ts. Returns the header set the rest of the
// service may read and the client IP it may believe. The two edura headers
// never reach a handler.
//
// How every core reader sees the right IP without a change to trustedClientIp:
// when the stamp is vouched, its value is written into the one slot
// trustedClientIp reads FIRST (the TRUSTED_CLIENT_IP_HEADER header if the
// deployment names one, else a single-entry x-forwarded-for, which every hop
// count resolves to); when it is not, the edura headers are stripped and the
// platform headers are left exactly as they arrived, so trustedClientIp reads
// the service's own edge the way it always has.
export function resolveProxiedClientIp(
  inbound: Headers,
  secret: string | undefined,
): ProxiedClientIp {
  const headers = new Headers(inbound);
  const stamped = headers.get(CLIENT_IP_HEADER);
  const auth = headers.get(PROXY_AUTH_HEADER);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_AUTH_HEADER);

  const vouched = stamped !== null && secretEquals(auth, secret?.trim() || undefined);
  if (!vouched) {
    return { ip: trustedClientIp((n) => headers.get(n)), vouched: false, headers };
  }

  const ip = normalizeIp(stamped) ?? "unknown";
  const slot = process.env.TRUSTED_CLIENT_IP_HEADER?.trim() || "x-forwarded-for";
  if (ip === "unknown") {
    // The proxy could not name a client either. Leave nothing for the fallback
    // arithmetic to misread as one.
    headers.delete(slot);
    headers.delete("x-forwarded-for");
  } else {
    headers.set(slot, ip);
  }
  return { ip, vouched: true, headers };
}
