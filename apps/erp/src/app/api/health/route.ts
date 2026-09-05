import { healthResponse } from "@repo/server-core/http/health";
import { bearerEquals, secretEquals } from "@repo/server-core/auth/secret-compare";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * SECURITY_AUDIT.md M-10. `?deep=mail` opens an SMTP handshake with the mail
 * credentials on every call. Unauthenticated and unlimited, that was a cheap
 * way to get the SMTP account rate-limited or locked — the same account that
 * delivers password resets — and an oracle for the mail configuration. The
 * deep probe now needs the cron secret (the one machine caller that has a
 * reason to ask); without it the request gets the ordinary shallow answer, not
 * an error, so uptime monitors that never sent `deep` see no change.
 */
function deepAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    bearerEquals(req.headers.get("authorization"), secret) ||
    secretEquals(req.headers.get("x-cron-secret"), secret)
  );
}

export async function GET(req: Request): Promise<Response> {
  const ip = trustedClientIp((n) => req.headers.get(n));
  if (!(await checkRateLimit(`health:${ip}`, 60, 60))) {
    return new Response(JSON.stringify({ error: { code: "rate_limited" } }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60" },
    });
  }
  const wantsDeep = new URL(req.url).searchParams.get("deep") === "mail";
  return healthResponse({ deepMail: wantsDeep && deepAllowed(req) });
}

export async function HEAD(): Promise<Response> {
  const res = await healthResponse();
  return new Response(null, { status: res.status, headers: res.headers });
}
