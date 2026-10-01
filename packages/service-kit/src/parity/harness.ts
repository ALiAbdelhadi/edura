import { createRequire } from "node:module";
import type { Env, Hono } from "hono";
import type { AfterScheduler } from "@repo/server-core/http/after";
import { runWithRequestHeaders } from "@repo/server-core/http/request-context";
import { nextRoute, type NextRouteHandler } from "../next-route";

export type Method = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "DELETE" | "PATCH";
// Next's own order (next/dist/server/web/http.js).
export const HTTP_METHODS: readonly Method[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"];

export type RouteModule = Partial<Record<Method, NextRouteHandler>>;

export type AutoImplement = (handlers: RouteModule) => Record<Method, NextRouteHandler>;
// What the frontend's installed Next contributes to side A.
export type NextOracle = { after: AfterScheduler; autoImplement: AutoImplement };

export type Call = {
  method: Method;
  path: string; // concrete path incl. query
  cookie?: string;
  headers?: Record<string, string>;
  body?: unknown; // sent as JSON
  rawBody?: string; // sent as-is; set its content-type in `headers`
};

// The rows-by-SQL handle the audit helpers need (the test pool of
// packages/database/scripts/test-pool).
export type ParityPool = {
  query: (sql: string) => Promise<{ rows: unknown[] }>;
  end: () => Promise<unknown>;
};

export type ParityHarnessOptions<P extends ParityPool> = {
  // The frontend's public origin every request is built against.
  origin: string;
  // The service's own folder (trailing slash): route modules load from its src/routes.
  serviceDir: string;
  // The frontend app's folder (trailing slash): Next itself, installed for that
  // app, is the oracle for how an app-route module answers HEAD, OPTIONS and
  // unexported methods.
  oracleDir: string;
  // Both sides register process-wide singletons (the auth instance the session
  // reader uses, the Sentry user tagger, the after() scheduler). In one process
  // the last registration wins, so each side re-binds its own before every call.
  bindNext: () => void;
  bindService: () => void;
  testPool: () => P;
};

export function createParityHarness<P extends ParityPool>(opts: ParityHarnessOptions<P>) {
  const oracleRequire = createRequire(`${opts.oracleDir}package.json`);

  // A route module under the service's src/routes, by its folder (`v1/me`,
  // `health`, `v1/_ping`). Both sides import this same module.
  async function apiRoute(rel: string): Promise<RouteModule> {
    return (await import(/* @vite-ignore */ `${opts.serviceDir}src/routes/${rel}/route.ts`)) as RouteModule;
  }

  function loadNextOracle(): NextOracle {
    const { after } = oracleRequire("next/server") as { after: AfterScheduler };
    // Next's own method table for an app route (HEAD runs GET, OPTIONS is a 204
    // with a sorted Allow, anything else unexported is a bare 405), loaded from
    // the frontend's installed next — so A answers unexported methods with Next's
    // code, not with the port of it in mount.ts that B runs.
    const { autoImplementMethods } = oracleRequire(
      "next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js",
    ) as { autoImplementMethods: AutoImplement };
    return { after, autoImplement: autoImplementMethods };
  }

  function buildRequest(call: Call): Request {
    const headers = new Headers({ "user-agent": "parity-harness", "x-forwarded-for": "203.0.113.7" });
    if (call.cookie) headers.set("cookie", call.cookie);
    for (const [k, v] of Object.entries(call.headers ?? {})) headers.set(k, v);
    let body: string | undefined;
    if (call.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(call.body);
    } else if (call.rawBody !== undefined) {
      body = call.rawBody;
    }
    return new Request(`${opts.origin}${call.path}`, { method: call.method, headers, body });
  }

  // A: how Next invokes an App Router handler — the Request plus a params promise,
  // with headers() answering from the same request (bound through the ALS the
  // service uses; Next's own headers() is unavailable outside a Next request).
  async function callNext(
    handler: NextRouteHandler,
    call: Call,
    params: Record<string, string | string[]> = {},
  ): Promise<Response> {
    opts.bindNext();
    const req = buildRequest(call);
    const res = await runWithRequestHeaders(req.headers, () => handler(req, { params: Promise.resolve(params) }));
    // Next's server writes no body for HEAD (Node's http response drops it), as
    // Hono does on the service side; compare what reaches the wire.
    if (call.method === "HEAD") return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
    return res;
  }

  // B: the service stack, the same handler mounted with nextRoute.
  async function callService<E extends Env>(app: Hono<E>, call: Call): Promise<Response> {
    opts.bindService();
    return app.request(buildRequest(call));
  }

  // ---- audit rows ------------------------------------------------------------

  let pool: P | null = null;
  function adminPool(): P {
    pool ??= opts.testPool();
    return pool;
  }

  // Audit rows are told apart by id, not by time: @default(now()) is stamped by
  // Prisma on the Node clock, so a created_at window against the database clock
  // can catch a row the harness itself wrote a moment before the call.
  async function auditIds(): Promise<Set<string>> {
    const { rows } = await adminPool().query(
      "SELECT id FROM audit_logs WHERE created_at > now() - interval '10 minutes'",
    );
    return new Set((rows as { id: string }[]).map((r) => r.id));
  }

  async function auditWrittenSince(seen: Set<string>): Promise<AuditRow[]> {
    const { rows } = await adminPool().query(
      `SELECT id, actor_id, action, target_type, target_id, center_id, on_behalf_of, before_state, after_state
       FROM audit_logs WHERE created_at > now() - interval '10 minutes' ORDER BY action, actor_id`,
    );
    return (rows as (AuditRow & { id: string })[])
      .filter((r) => !seen.has(r.id))
      .map((r) => {
        const rest: Partial<typeof r> = { ...r };
        delete rest.id;
        return rest as AuditRow;
      });
  }

  async function closeAdminPool(): Promise<void> {
    if (pool) await pool.end();
    pool = null;
  }

  return { apiRoute, loadNextOracle, callNext, callService, adminPool, auditIds, auditWrittenSince, closeAdminPool };
}

export function mount<E extends Env>(app: Hono<E>, method: Method, pattern: string, handler: NextRouteHandler): void {
  app.on(method, pattern, nextRoute(handler));
}

export type Snapshot = {
  status: number;
  body: unknown;
  cacheControl: string | null;
  contentType: string | null;
  contentDisposition: string | null;
  allow: string | null;
  location: string | null;
  vary: string | null;
  setCookieNames: string[];
  // Each Set-Cookie with its value dropped and Expires reduced to "<date>":
  // name plus every attribute (Path, Domain, Max-Age, HttpOnly, Secure, SameSite).
  setCookieAttrs: string[];
};

export async function snapshot(res: Response, normalize?: (body: unknown) => unknown): Promise<Snapshot> {
  // ignoreBOM keeps a leading U+FEFF (the CSV exports carry one) in the body.
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  let body: unknown = text === "" ? null : text;
  if (text && (res.headers.get("content-type") ?? "").includes("json")) body = JSON.parse(text);
  return {
    status: res.status,
    body: normalize ? normalize(body) : body,
    cacheControl: res.headers.get("cache-control"),
    contentType: res.headers.get("content-type"),
    contentDisposition: res.headers.get("content-disposition"),
    allow: res.headers.get("allow"),
    location: res.headers.get("location"),
    vary: res.headers.get("vary"),
    setCookieAttrs: res.headers
      .getSetCookie()
      .map((c) => {
        const [pair, ...attrs] = c.split(";").map((p) => p.trim());
        const name = pair!.split("=")[0]!;
        return [name, ...attrs.map((a) => (/^expires=/i.test(a) ? "Expires=<date>" : a))].join("; ");
      })
      .sort(),
    setCookieNames: res.headers
      .getSetCookie()
      .map((c) => c.split("=")[0]!.trim())
      .sort(),
  };
}

export type AuditRow = {
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  center_id: string | null;
  on_behalf_of: string | null;
  before_state: unknown;
  after_state: unknown;
};

// A field-by-field list of where two values differ, for the parity tables.
export function differences(a: unknown, b: unknown, at = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${at}.length: A=${a.length} B=${b.length}`];
    return a.flatMap((v, i) => differences(v, b[i], `${at}[${i}]`));
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k),
    );
  }
  return [`${at || "(root)"}: A=${JSON.stringify(a)?.slice(0, 120)} B=${JSON.stringify(b)?.slice(0, 120)}`];
}
