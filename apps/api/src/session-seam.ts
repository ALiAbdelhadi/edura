import { AsyncLocalStorage } from "node:async_hooks";
import type { Hono, MiddlewareHandler } from "hono";
import { observabilityIdentity, type SessionLike } from "@repo/observability";
import { createErpAuth } from "@repo/server-core/erp-auth/create-auth";
import { setErpAuth } from "@repo/server-core/erp-auth/instance";
import { setUserTagger } from "@repo/server-core/observability/user-tagger";
import type { RequestUserSlot, SessionEnv } from "@repo/service-kit/create-app";
import { serviceCookies, serviceCookieSink } from "./session-cookies";

// The same better-auth instance apps/erp builds (createErpAuth — one options
// object for every host), with serviceCookies() in the last slot nextCookies()
// occupies there: cookies a server-side auth.api call sets reach the Response
// through the sink middleware below. Built at module load, as
// apps/erp/src/lib/auth/auth.ts is.
export const auth = createErpAuth({ extraPlugins: [serviceCookies()] });

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
// and requestMemo() to the request. better-auth's own /api/auth/* handler is
// mounted when the auth routes move (phase 3), not here.
export function mountSessionLayer(app: Hono<SessionEnv>): void {
  bindSessionHost();
  app.use(userSlot());
  app.use(serviceCookieSink());
}

// The two process-wide registrations on their own, for a harness that runs the
// Next host and this one in the same process and re-binds before each call.
export function bindSessionHost(): void {
  setErpAuth(auth);
  setUserTagger(tagRequestUser);
}
