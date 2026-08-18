import { NextResponse } from "next/server";

export type Envelope<T> =
  | { data: T; meta?: Record<string, unknown> }
  | { error: { code: string; message: string; [k: string]: unknown } };

function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = serialize(val);
  }
  return out;
}

/**
 * EVERY API RESPONSE IS UNCACHEABLE, and that is not hygiene — it is the one
 * line that keeps one person's data from being handed to another.
 *
 * Almost everything this envelope carries is scoped to the caller's session: a
 * wallet balance, a child's attendance, `GET /api/v1/me` itself. The routes are
 * `force-dynamic`, which stops Next from caching them — but nothing was telling
 * the layers BETWEEN the server and the reader (a CDN, a corporate proxy, the
 * browser's own heuristic freshness) that a 200 with no cache directive must
 * not be reused. `private` alone would still permit the browser to reuse it for
 * a different signed-in user on a shared machine; `no-store` is the only value
 * that means "do not keep this anywhere".
 *
 * Filed under docs/reports/session-identity-mismatch.md — investigating a
 * session that resolved to two different people, this was the one hazard that
 * could be removed outright instead of argued about.
 */
const UNCACHEABLE = { "Cache-Control": "no-store" } as const;

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  const serialized = serialize(data) as T;
  const body: Envelope<T> = init?.meta
    ? { data: serialized, meta: serialize(init.meta) as Record<string, unknown> }
    : { data: serialized };
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: UNCACHEABLE,
  });
}

export function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(extra ?? {}) } },
    { status, headers: UNCACHEABLE },
  );
}
