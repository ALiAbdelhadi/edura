import { NextResponse } from "next/server";
import { checkRateLimit } from "./tokenBucket";

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx) => Promise<NextResponse> | NextResponse;

/**
 * Rate-limit decorator for route handlers.
 * @param handler  The route handler to wrap.
 * @param capacity Max burst tokens (= max requests before any refill).
 * @param perMinute Sustained rate in requests per minute.
 */
export function withRateLimit(
  handler: Handler,
  capacity: number,
  perMinute: number,
): Handler {
  return async (req, ctx) => {
    const ip =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const url = new URL(req.url);
    const key = `${url.pathname}:${ip}`;

    if (!checkRateLimit(key, capacity, perMinute)) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many requests, please slow down." } },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    return handler(req, ctx);
  };
}
