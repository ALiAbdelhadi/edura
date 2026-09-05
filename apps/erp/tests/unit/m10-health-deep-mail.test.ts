// SECURITY_AUDIT.md M-10 — the deep mail probe is gated behind the cron secret
// and the health route is rate limited; the shallow answer is unchanged.
import { afterEach, describe, expect, it, vi } from "vitest";

const { healthResponse } = vi.hoisted(() => ({
  healthResponse: vi.fn(async (opts?: { deepMail?: boolean }) =>
    new Response(JSON.stringify({ deepMail: opts?.deepMail === true }), { status: 200 }),
  ),
}));
vi.mock("@repo/server-core/http/health", () => ({ healthResponse }));

import { GET } from "@/app/api/health/route";
import { __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";

let ipCounter = 0;
const get = (url: string, headers: Record<string, string> = {}) =>
  GET(new Request(url, { headers: { "x-forwarded-for": headers["x-forwarded-for"] ?? `10.0.0.${++ipCounter}`, ...headers } }));
const deep = async (res: Response) => ((await res.json()) as { deepMail: boolean }).deepMail;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  __resetRateLimiterForTests();
});

describe("M-10 — GET /api/health?deep=mail", () => {
  it("without a secret the deep probe is silently downgraded to the shallow check (no error, no SMTP)", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await get("http://localhost/api/health?deep=mail");
    expect(res.status).toBe(200);
    expect(await deep(res)).toBe(false);
  });

  it("with the cron secret (either header form) the deep probe runs", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(await deep(await get("http://localhost/api/health?deep=mail", { "x-cron-secret": "s3cret" }))).toBe(true);
    expect(await deep(await get("http://localhost/api/health?deep=mail", { authorization: "Bearer s3cret" }))).toBe(true);
  });

  it("a wrong secret, or no CRON_SECRET configured at all, never opens SMTP", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(await deep(await get("http://localhost/api/health?deep=mail", { "x-cron-secret": "nope" }))).toBe(false);
    vi.stubEnv("CRON_SECRET", "");
    expect(await deep(await get("http://localhost/api/health?deep=mail", { "x-cron-secret": "" }))).toBe(false);
  });

  it("the shallow check without `deep` is unchanged", async () => {
    const res = await get("http://localhost/api/health");
    expect(res.status).toBe(200);
    expect(await deep(res)).toBe(false);
  });

  it("is rate limited per IP (61st call in a minute → 429)", async () => {
    vi.stubEnv("REDIS_URL", "");
    __resetRateLimiterForTests();
    let last: Response | null = null;
    for (let i = 0; i < 61; i++) last = await get("http://localhost/api/health", { "x-forwarded-for": "203.0.113.9" });
    expect(last!.status).toBe(429);
    expect(healthResponse).toHaveBeenCalledTimes(60);
  });
});
