import { NextResponse } from "next/server";
import { AppError } from "./classes";
import { fail } from "../http/envelope";

function prismaErrorStatus(err: unknown): { status: number; code: string; message: string } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: string; message?: string; meta?: { cause?: unknown } };
  switch (e.code) {
    case "P2023":
      return { status: 404, code: "not_found", message: "Resource not found" };
    case "P2025":
      return { status: 404, code: "not_found", message: "Resource not found" };
    case "P2002":
      return { status: 409, code: "conflict", message: "A record with these unique values already exists" };
    default:
      break;
  }
  if (typeof e.message === "string" && e.message.includes("invalid input syntax for type uuid")) {
    return { status: 404, code: "not_found", message: "Resource not found" };
  }
  return null;
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const extra: Record<string, unknown> = {};
    if (err.details && typeof err.details === "object") {
      const details = err.details as Record<string, unknown>;
      if ("fields" in details) extra.fields = details.fields;
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(details)) {
        if (k !== "fields") rest[k] = v;
      }
      if (Object.keys(rest).length > 0) extra.details = rest;
    }
    return fail(err.status, err.code, err.message, extra);
  }

  const prismaMapped = prismaErrorStatus(err);
  if (prismaMapped) {
    return fail(prismaMapped.status, prismaMapped.code, prismaMapped.message);
  }

  // Always log the real error server-side, with full detail, in every
  // environment — the logs keep the table/column names, constraint text, file
  // paths and library internals we need to debug.
  console.error("[unhandled]", err);
  // But never leak those internals to the client in production: return a fixed
  // generic message for the fallback branch. In development, surface the real
  // message for debuggability.
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "Internal error";
  return fail(500, "internal", message);
}

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx) => Promise<NextResponse> | NextResponse;

export function withErrors(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx ?? { params: Promise.resolve({}) });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
