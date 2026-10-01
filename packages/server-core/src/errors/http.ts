import { AppError } from "./classes";
import { fail } from "../http/envelope";

function prismaErrorStatus(err: unknown): { status: number; code: string; message: string } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: string; message?: string; meta?: { cause?: unknown } };
  switch (e.code) {
    case "P2023":
      if (/malformed/i.test(e.message ?? "")) {
        return { status: 404, code: "not_found", message: "Resource not found" };
      }
      break;
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

export function toErrorResponse(err: unknown): Response {
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

  console.error("[unhandled]", err);
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "Internal error";
  return fail(500, "internal", message);
}

export type RouteCtx = { params: Promise<Record<string, string>> };
export type Handler = (
  req: Request,
  ctx: RouteCtx,
) => Promise<Response> | Response;

export function withErrors(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx ?? { params: Promise.resolve({}) });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
