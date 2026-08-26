import { healthResponse } from "@repo/server-core/http/health";

// Deliberately at /api/health, NOT /api/v1/health: this is infrastructure, not
// product API. It must keep working across every future API version, and an
// uptime monitor's URL should never need changing because the API did.
//
// Unauthenticated and un-rate-limited by design — the monitor polls it once a
// minute from rotating IPs, and a rate-limited health check reports outages
// that are not happening. It leaks nothing (see @repo/server-core/http/health).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request): Promise<Response> {
  // `?deep=mail` — the opt-in SMTP verify (see @repo/server-core/http/health).
  const deepMail = new URL(req.url).searchParams.get("deep") === "mail";
  return healthResponse({ deepMail });
}

/** Monitors that use HEAD get the same status code with no body. */
export async function HEAD(): Promise<Response> {
  const res = await healthResponse();
  return new Response(null, { status: res.status, headers: res.headers });
}
