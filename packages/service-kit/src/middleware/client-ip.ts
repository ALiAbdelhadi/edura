import type { MiddlewareHandler } from "hono";
import { resolveProxiedClientIp } from "@repo/server-core/http/proxy-client-ip-trust";

export type ClientIpEnv = { Variables: { clientIp: string; clientIpVouched: boolean } };

// Replaces the raw Request with one whose headers have been through
// resolveProxiedClientIp, so neither a handler nor requestHeaders() can ever
// read a browser-set x-edura-client-ip. See server-core http/proxy-client-ip.ts.
export function clientIp(secret: () => string | undefined): MiddlewareHandler<ClientIpEnv> {
  return async (c, next) => {
    const resolved = resolveProxiedClientIp(c.req.raw.headers, secret());
    c.req.raw = new Request(c.req.raw, { headers: resolved.headers });
    c.set("clientIp", resolved.ip);
    c.set("clientIpVouched", resolved.vouched);
    await next();
  };
}
