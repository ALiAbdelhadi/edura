import { NextResponse } from "next/server";
import { arabicErrorMessage } from "../errors/messages-ar";

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
  // `message` stays canonical English — screens and tests match on it. The
  // Arabic rendering rides ALONGSIDE it and the client picks by locale.
  const messageAr = arabicErrorMessage(message);
  return NextResponse.json(
    { error: { code, message, ...(messageAr ? { messageAr } : {}), ...(extra ?? {}) } },
    { status, headers: UNCACHEABLE },
  );
}
