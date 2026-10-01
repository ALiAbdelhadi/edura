import { readdirSync } from "node:fs";
import type { RouteEntry, RouteModule } from "../mount";

// The registry sweep: every route in the generated ROUTES table, called as a
// bare handler (A) and through the service stack (B) with placeholder params.
// A route file under src/routes that the ROUTES registry does not list is
// reported as skipped: it is served by nothing.

// Stand-ins for dynamic segments: a well-formed UUID no row carries, and one
// fixed segment for a catch-all.
export const DUMMY_ID = "00000000-0000-4000-8000-0000000000aa";
export const DUMMY_SEGMENT = "parity-seg";

export type SweepRoute = {
  path: string; // Next path, e.g. /api/v1/rooms/[id]
  rel: string; // folder under the service's src/routes
  url: string; // concrete request path
  params: Record<string, string | string[]>; // what Next would hand the handler for `url`
  module: RouteModule;
};

export type SweepSkip = { path: string; reason: string };

function concrete(path: string): { url: string; params: Record<string, string | string[]> } {
  const params: Record<string, string | string[]> = {};
  const url = path
    .split("/")
    .map((seg) => {
      const catchAll = /^\[\.\.\.([A-Za-z0-9_]+)\]$/.exec(seg);
      if (catchAll) {
        params[catchAll[1]!] = [DUMMY_SEGMENT];
        return DUMMY_SEGMENT;
      }
      const param = /^\[([A-Za-z0-9_]+)\]$/.exec(seg);
      if (param) {
        params[param[1]!] = DUMMY_ID;
        return DUMMY_ID;
      }
      return seg;
    })
    .join("/");
  return { url, params };
}

// Next path for a route folder (relative to src/routes, without /route.ts).
function nextPathOf(rel: string): string {
  return `/api/${rel}`;
}

// `routes` is the service's generated ROUTES table, `routesDir` its src/routes folder.
export function sweepRoutes(
  routes: readonly RouteEntry[],
  routesDir: string,
): { routes: SweepRoute[]; skipped: SweepSkip[] } {
  const swept: SweepRoute[] = [];
  const skipped: SweepSkip[] = [];
  const registered = new Set<string>();
  for (const { path, module } of routes) {
    registered.add(path);
    swept.push({ path, rel: path.slice("/api/".length), module, ...concrete(path) });
  }
  const routeFiles = readdirSync(routesDir, { recursive: true, encoding: "utf8" })
    .filter((f) => f === "route.ts" || f.endsWith("/route.ts"))
    .map((f) => nextPathOf(f.replace(/\/?route\.ts$/, "")))
    .sort();
  for (const path of routeFiles) {
    if (!registered.has(path)) skipped.push({ path, reason: "route file not in the ROUTES registry" });
  }
  return { routes: swept, skipped };
}
