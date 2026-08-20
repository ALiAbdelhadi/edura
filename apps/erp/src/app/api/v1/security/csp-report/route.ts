import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { captureCspReport } from "@/lib/observability/csp-report";

export const dynamic = "force-dynamic";

/**
 * WHERE CSP VIOLATIONS ACTUALLY GO.
 *
 * The policy shipped as `Content-Security-Policy-Report-Only` from the day H4
 * landed, and carried NO `report-uri` and NO `report-to`. A Report-Only policy
 * with nowhere to report is not a weak control — it is not a control at all:
 * it blocks nothing by definition, and it recorded nothing either. Months of
 * "we are observing before we enforce" produced zero observations, which is
 * also why nobody could say what enforcing would break.
 *
 * DELIBERATELY UNAUTHENTICATED. The browser posts these reports itself, with
 * no session and no CORS preflight; requiring auth would mean receiving only
 * the violations of signed-in users, which excludes the login page — the one
 * surface an injection attack cares most about.
 *
 * THEREFORE RATE-LIMITED, and hard. A public unauthenticated POST that writes
 * anywhere is an amplification target: a single attacker can emit violations
 * in a loop. The bucket is per-IP like every other public route, the body is
 * size-capped before parsing, and nothing here touches the database — reports
 * go to the log/Sentry, which are built to shed load. A dropped report is a
 * lost datum; a database write per forged report is an outage.
 *
 * Always answers 204. A browser cannot act on an error here, and a non-2xx
 * teaches some agents to retry, turning one violation into many.
 */

/** Reports above this are truncated, not parsed. Real ones are ~1 KB. */
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

// 60/min per IP: generous for a genuinely broken page (which can emit a burst
// on first paint), far below what an amplification attempt needs.
export const POST = withRateLimit(handle, 60, 60);
