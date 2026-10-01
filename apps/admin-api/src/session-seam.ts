import { AsyncLocalStorage } from "node:async_hooks";
import type { Hono, MiddlewareHandler } from "hono";
import { observabilityIdentity, type SessionLike } from "@repo/observability";
import { createAdminAuth } from "@repo/server-core/backoffice-auth/create-auth";
import { setAdminAuth } from "@repo/server-core/backoffice-auth/instance";
import { setUserTagger } from "@repo/server-core/observability/user-tagger";
import type { RequestUserSlot, SessionEnv } from "@repo/service-kit/create-app";
import { serviceCookies, serviceCookieSink } from "./session-cookies";

// The same better-auth instance apps/superadmin builds (createAdminAuth — one
// options object for every host: 2FA, admin plugin, sealing, login policy),
// with serviceCookies() in the last slot nextCookies() occupies there: cookies
// a server-side auth.api call sets reach the Response through the sink
// middleware below. Built at module load, as apps/superadmin/src/lib/auth/auth.ts
// is. This is the back office's own instance — the ERP's lives in apps/api.
export const auth = createAdminAuth({ extraPlugins: [serviceCookies()] });

export type { RequestUserSlot, SessionEnv };

// Who the request is for, kept per request. @sentry/node's setUser writes to a
// scope that Bun.serve does not isolate per request, so the service records the
// identity here and the error handler puts it on the captured event's own scope.
const userSlots = new AsyncLocalStorage<RequestUserSlot>();

function tagRequestUser(session: SessionLike | null | undefined): void {
  const slot = userSlots.getStore();
  if (slot) slot.identity = observabilityIdentity(session);
}

function userSlot(): MiddlewareHandler<SessionEnv> {
  return (c, next) => {
    const slot: RequestUserSlot = { identity: null };
    c.set("userSlot", slot);
    return userSlots.run(slot, () => next());
  };
}

// Registers the session reader's auth instance and user tagger, then binds the
// per-request user slot and the set-cookie sink. Session reads themselves need
// nothing more: the requestContext middleware already scopes requestHeaders()
// to the request. better-auth's own /api/auth/* handler is a route
// (routes/auth/[...all]), not middleware.
export function mountSessionLayer(app: Hono<SessionEnv>): void {
  bindSessionHost();
  app.use(userSlot());
  app.use(serviceCookieSink());
}

// The two process-wide registrations on their own, for a harness that runs the
// Next host and this one in the same process and re-binds before each call.
export function bindSessionHost(): void {
  setAdminAuth(auth);
  setUserTagger(tagRequestUser);
}
