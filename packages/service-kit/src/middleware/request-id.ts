import type { MiddlewareHandler } from "hono";

export const REQUEST_ID_HEADER = "x-request-id";
const SANE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestIdEnv = { Variables: { requestId: string } };

// An inbound id is kept only when it is plainly an id: it is echoed on the
// response and written on every log line, so it must not carry free text.
export function requestIdFrom(header: string | null | undefined): string {
  const v = header?.trim() ?? "";
  return SANE_REQUEST_ID.test(v) ? v : crypto.randomUUID();
}

export function requestId(): MiddlewareHandler<RequestIdEnv> {
  return async (c, next) => {
    const id = requestIdFrom(c.req.header(REQUEST_ID_HEADER));
    c.set("requestId", id);
    await next();
    try {
      c.res.headers.set(REQUEST_ID_HEADER, id);
    } catch {
      c.res = new Response(c.res.body, c.res);
      c.res.headers.set(REQUEST_ID_HEADER, id);
    }
  };
}
