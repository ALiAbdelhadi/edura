import { bearerEquals, secretEquals } from "../auth/secret-compare";
import { checkRateLimit, trustedClientIp } from "../rate-limit/token-bucket";
import { healthResponse } from "./health";

// Moved unchanged from apps/erp/src/app/api/health/route.ts (2026-09-30) so
// apps/api mounts the same handlers instead of a copy. Kept apart from
// ./health so a test that mocks that module still sees these handlers.
function deepAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    bearerEquals(req.headers.get("authorization"), secret) ||
    secretEquals(req.headers.get("x-cron-secret"), secret)
  );
}

export async function healthGet(req: Request): Promise<Response> {
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

export async function healthHead(): Promise<Response> {
  const res = await healthResponse();
  return new Response(null, { status: res.status, headers: res.headers });
}
