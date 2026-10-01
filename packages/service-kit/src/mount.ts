import type { Hono } from "hono";
import { nextRoute, type NextRouteHandler } from "./next-route";

// The methods a Next app-route module may export, in Next's own order
// (next/dist/server/web/http.js).
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

// A route's own ctx type is narrower than NextRouteContext (`{ id: string }`
// rather than string | string[]), so a module's handlers are accepted with any
// ctx; nextRoute hands each one the params Next would have built.
type ModuleHandler = (req: Request, ctx: never) => Response | Promise<Response>;
export type RouteModule = Partial<Record<HttpMethod, ModuleHandler>>;

// One moved route: its Next path under /api (`/api/v1/rooms/[id]`) and the
// module both hosts import. The ERP file at the same path re-exports it until
// phase 4 deletes the ERP copy.
export type RouteEntry = { path: string; module: RouteModule };

// Next path → Hono pattern. `[name]` → `:name`, `[...name]` → `:name{.+}`.
// An optional catch-all `[[...name]]` is not supported here: no ERP route uses
// one, and it would need two registrations (see next-route.ts).
export function honoPattern(nextPath: string): string {
  return nextPath
    .split("/")
    .map((seg) => {
      if (seg.startsWith("[[")) throw new Error(`optional catch-all not supported: ${nextPath}`);
      const catchAll = /^\[\.\.\.([A-Za-z0-9_]+)\]$/.exec(seg);
      if (catchAll) return `:${catchAll[1]}{.+}`;
      const param = /^\[([A-Za-z0-9_]+)\]$/.exec(seg);
      return param ? `:${param[1]}` : seg;
    })
    .join("/");
}

// Next's autoImplementMethods (next/dist/server/route-modules/app-route/helpers/
// auto-implement-methods.js), reproduced so a route answers every method the way
// the Next route did: HEAD runs GET, OPTIONS is a 204 with a sorted `Allow`, and
// any other method the module does not export is a bare 405.
export function autoImplementMethods(mod: RouteModule): Record<HttpMethod, NextRouteHandler> {
  const notAllowed: NextRouteHandler = () => new Response(null, { status: 405 });
  const methods = Object.fromEntries(
    HTTP_METHODS.map((m) => [m, (mod[m] as NextRouteHandler | undefined) ?? notAllowed]),
  ) as Record<HttpMethod, NextRouteHandler>;
  const implemented = new Set<HttpMethod>(HTTP_METHODS.filter((m) => mod[m]));
  if (!implemented.has("HEAD") && mod.GET) {
    methods.HEAD = methods.GET;
    implemented.add("HEAD");
  }
  if (!implemented.has("OPTIONS")) {
    const allow: string[] = ["OPTIONS", ...implemented];
    if (!implemented.has("HEAD") && implemented.has("GET")) allow.push("HEAD");
    const headers = { Allow: allow.sort().join(", ") };
    methods.OPTIONS = () => new Response(null, { status: 204, headers });
  }
  return methods;
}

export function mountRoutes<E extends object>(app: Hono<E & object>, entries: readonly RouteEntry[]): void {
  for (const { path, module } of entries) {
    const pattern = honoPattern(path);
    const methods = autoImplementMethods(module);
    for (const method of HTTP_METHODS) {
      if (method === "HEAD") continue;
      if (method === "GET") {
        // Hono dispatches a HEAD request as GET and drops the body afterwards
        // (hono-base.js), so a HEAD registration is never reached. The raw
        // request still says HEAD; route it to the module's HEAD from here.
        const get = nextRoute(methods.GET);
        const head = nextRoute(methods.HEAD);
        app.get(pattern, (c, next) => (c.req.raw.method === "HEAD" ? head(c, next) : get(c, next)));
        continue;
      }
      app.on(method, pattern, nextRoute(methods[method]));
    }
  }
}
