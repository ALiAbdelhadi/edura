import type { Context, Handler } from "hono";

export type NextRouteParams = Record<string, string | string[]>;
export type NextRouteContext = { params: Promise<NextRouteParams> };
export type NextRouteHandler = (req: Request, ctx: NextRouteContext) => Promise<Response> | Response;

// Mounts a Next-style route export on a Hono path with its body untouched.
// Params are rebuilt from the RAW pathname against the registered pattern, the
// way Next builds them: each `[name]` segment is decodeURIComponent'd on its
// own; a catch-all `[...name]` is the remaining raw segments, each decoded, as
// a string[]. Hono's own `c.req.param()` is deliberately not used because it
// decodes before splitting, which changes segmentation when a value carries
// an encoded slash. Register catch-alls as `:name{.+}`; an optional catch-all
// `[[...name]]` is two registrations, the bare path (params = {}) and the
// `:name{.+}` form.
export function nextRoute(handler: NextRouteHandler): Handler {
  return (c) => handler(c.req.raw, { params: Promise.resolve(routeParams(c)) });
}

export function routeParams(c: Context): NextRouteParams {
  return paramsFromPattern(c.req.routePath, new URL(c.req.raw.url).pathname);
}

const PARAM = /^:([A-Za-z0-9_]+)(\{.*\})?$/;

export function paramsFromPattern(pattern: string, rawPathname: string): NextRouteParams {
  const out: NextRouteParams = {};
  const patternSegs = pattern.split("/");
  const pathSegs = rawPathname.split("/");
  for (let i = 0; i < patternSegs.length; i++) {
    const m = PARAM.exec(patternSegs[i] ?? "");
    if (!m) continue;
    const name = m[1]!;
    if (m[2]) {
      out[name] = pathSegs.slice(i).map(decodeSegment);
      break;
    }
    out[name] = decodeSegment(pathSegs[i] ?? "");
  }
  return out;
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
