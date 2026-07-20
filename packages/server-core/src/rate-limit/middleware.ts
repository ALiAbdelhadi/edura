import { NextResponse } from "next/server";
import { checkRateLimit, trustedClientIp } from "./token-bucket";

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx) => Promise<NextResponse> | NextResponse;

export function withRateLimit(
  handler: Handler,
  capacity: number,
  perMinute: number,
): Handler {
  return async (req, ctx) => {
    // M3: trusted proxy hop, not the spoofable leftmost XFF entry.
    const ip = trustedClientIp((n) => req.headers.get(n));
    const url = new URL(req.url);
    const key = `${url.pathname}:${ip}`;

    if (!(await checkRateLimit(key, capacity, perMinute))) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many requests, please slow down." } },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    return handler(req, ctx);
  };
}
