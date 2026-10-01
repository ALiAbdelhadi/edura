import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import {
  createAuthMiddleware,
  setShouldSkipSessionRefresh,
  type BetterAuthPlugin,
} from "@repo/server-core/erp-auth/plugin-api";
import { requestHeaders, type RequestHeaders } from "@repo/server-core/http/request-context";

// The service's counterpart of better-auth's nextCookies(): the cookies a
// SERVER-SIDE `auth.api.*` call sets (a session refresh after updateAge, a
// sign-out, a claim) are produced on ctx.context.responseHeaders, which the
// caller never sees unless it asked for `returnHeaders`. nextCookies() copies
// them into Next's cookies() store; here they go into a per-request sink that
// the serviceCookieSink() middleware drains onto the Response. The raw header
// strings are kept: Secure, HttpOnly, SameSite, Path, Max-Age and the
// __Secure- prefix must be exactly what better-auth emitted.

const sinks = new AsyncLocalStorage<string[]>();

export const SERVICE_COOKIES_PLUGIN_ID = "service-cookies";

// RSC sends `RSC: 1` without `next-action`; only there can a cookie not be
// written, so the DB row must not be extended either (nextCookies' rule).
export function isCookielessRscRequest(h: RequestHeaders): boolean {
  return h.get("RSC") === "1" && !h.get("next-action");
}

// What the after hook does with the auth call's response headers. Outside a
// request scope (a script, a unit test without the app) there is no sink and
// this is a no-op, as nextCookies is outside a Next request.
export function collectServiceCookies(returned: unknown): void {
  const sink = sinks.getStore();
  if (!sink || !(returned instanceof Headers)) return;
  for (const raw of returned.getSetCookie()) sink.push(raw);
}

export function serviceCookies(): BetterAuthPlugin {
  return {
    id: SERVICE_COOKIES_PLUGIN_ID,
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            if ("_flag" in ctx && ctx._flag === "router") return;
            let h: RequestHeaders;
            try {
              h = await requestHeaders();
            } catch {
              return;
            }
            if (isCookielessRscRequest(h)) await setShouldSkipSessionRefresh(true);
          }),
        },
      ],
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            if ("_flag" in ctx && ctx._flag === "router") return;
            collectServiceCookies(ctx.context.responseHeaders);
          }),
        },
      ],
    },
  };
}

export function cookieName(setCookie: string): string {
  const eq = setCookie.indexOf("=");
  return (eq === -1 ? setCookie : setCookie.slice(0, eq)).trim();
}

// Opens the sink for the request, then appends what the auth calls set onto
// the response. Per name the LAST value the auth layer set wins (a store's
// set() replaces). A cookie the route's own response already carries wins over
// the sink's copy of the same name: the route either forwarded the auth
// headers itself (the same cookie would go out twice) or deliberately
// overrode it (a clear, a re-mint) — a stale copy must not undo that.
export function serviceCookieSink(): MiddlewareHandler {
  return async (c, next) => {
    const sink: string[] = [];
    await sinks.run(sink, () => next());
    if (sink.length === 0) return;
    const byName = new Map<string, string>();
    for (const raw of sink) byName.set(cookieName(raw), raw);
    for (const own of c.res.headers.getSetCookie()) byName.delete(cookieName(own));
    if (byName.size === 0) return;
    try {
      for (const raw of byName.values()) c.res.headers.append("set-cookie", raw);
    } catch {
      c.res = new Response(c.res.body, c.res);
      for (const raw of byName.values()) c.res.headers.append("set-cookie", raw);
    }
  };
}
