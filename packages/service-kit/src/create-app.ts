import { Hono } from "hono";
import type { ObservabilityIdentity } from "@repo/observability";
import { NotFoundError } from "@repo/server-core/errors/classes";
import { toErrorResponse } from "@repo/server-core/errors/http";
import type { RequestLog } from "./log";
import { clientIp, type ClientIpEnv } from "./middleware/client-ip";
import { requestContext } from "./middleware/request-context";
import { requestId, type RequestIdEnv } from "./middleware/request-id";
import { mountRoutes, type RouteEntry } from "./mount";
import { captureServerError } from "./observability";

// Who the request is for, kept per request by the service's session seam; the
// error handler below puts it on the captured event's own scope.
export type RequestUserSlot = { identity: ObservabilityIdentity | null };
export type SessionEnv = { Variables: { userSlot: RequestUserSlot } };

export type ServiceAppEnv = RequestIdEnv & ClientIpEnv & SessionEnv;

export type CreateServiceAppOptions = {
  routes: readonly RouteEntry[];
  // The service's session seam: registers its auth instance and user tagger,
  // then binds the per-request user slot and the set-cookie sink.
  mountSession: (app: Hono<SessionEnv>) => void;
  log: RequestLog;
  proxySecret?: () => string | undefined;
  accessLog?: boolean;
};

export function createServiceApp(opts: CreateServiceAppOptions): Hono<ServiceAppEnv> {
  const app = new Hono<ServiceAppEnv>();
  const requestLog = opts.log;
  const proxySecret = opts.proxySecret ?? (() => process.env.EDURA_PROXY_SECRET?.trim() || undefined);
  const accessLog = opts.accessLog ?? process.env.NODE_ENV !== "test";

  app.use(requestId());
  app.use(clientIp(proxySecret));
  app.use(requestContext());
  if (accessLog) {
    app.use(async (c, next) => {
      const started = performance.now();
      await next();
      const ms = Math.round(performance.now() - started);
      requestLog(c.get("requestId")).info(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
    });
  }

  // Exactly the envelope withErrors() produces in the Next apps — one mapping.
  app.onError((err, c) => {
    const rid = c.get("requestId") ?? "-";
    const res = toErrorResponse(err);
    if (res.status >= 500) {
      requestLog(rid).error(`${c.req.method} ${c.req.path} -> ${res.status}`, err);
      captureServerError(err, rid, c.get("userSlot")?.identity ?? null);
    }
    return res;
  });
  // Next answers an unknown /api/v1/* with its HTML not-found page; the service
  // answers with the envelope a NotFoundError produces.
  app.notFound(() => toErrorResponse(new NotFoundError()));

  opts.mountSession(app as unknown as Hono<SessionEnv>);

  mountRoutes(app, opts.routes);

  return app;
}
