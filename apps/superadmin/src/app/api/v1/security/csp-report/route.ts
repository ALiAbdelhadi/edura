import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { captureCspReport } from "@/lib/observability/csp-report";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

async function handle(req: Request): Promise<NextResponse> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (raw.length > MAX_BODY_BYTES) raw = raw.slice(0, MAX_BODY_BYTES);

  captureCspReport(raw, req.headers.get("user-agent"));
  return new NextResponse(null, { status: 204 });
}

export const POST = withRateLimit(handle, 60, 60);
