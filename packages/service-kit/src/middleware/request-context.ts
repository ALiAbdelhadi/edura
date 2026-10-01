import type { MiddlewareHandler } from "hono";
import { runWithRequestHeaders } from "@repo/server-core/http/request-context";

// Binds the (already sanitised) request headers for the rest of the call, so
// core code that is not handed the Request — requireSession() and friends —
// reads them through requestHeaders(). Must run AFTER the client-ip middleware.
export function requestContext(): MiddlewareHandler {
  return (c, next) => runWithRequestHeaders(c.req.raw.headers, () => next());
}
