import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { bearerEquals, secretEquals } from "@repo/server-core/auth/secret-compare";
import { healthResponse } from "@repo/server-core/http/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;


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
