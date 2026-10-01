// SECURITY_AUDIT.md M-11 — the forgot-password route: per-email throttle,
// constant-shape response, and the request tagged with the app it came through.
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(async () => undefined),
}));
vi.mock("@repo/server-core/services/auth/password-reset", () => ({ requestPasswordReset }));

import { POST } from "../../src/routes/v1/auth/password/forgot/route";
import { PER_EMAIL_CAPACITY } from "@repo/server-core/services/auth/reset-throttle";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";

let ip = 0;
const post = (email: string) =>
  POST(
    new Request("http://localhost/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}` },
      body: JSON.stringify({ email, locale: "ar" }),
    }),
    { params: Promise.resolve({}) },
  );
const settle = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  __resetRateLimiterForTests();
});

describe("M-11 — POST /api/v1/auth/password/forgot", () => {
  it("passes app='www' so back-office accounts cannot be reset from the ERP door", async () => {
    vi.stubEnv("REDIS_URL", "");
    await post("Someone@X.io");
    await settle();
    expect(requestPasswordReset).toHaveBeenCalledWith("someone@x.io", "ar", { app: "www" });
  });

  it("throttles per EMAIL across different IPs: the 4th request in an hour sends nothing", async () => {
    vi.stubEnv("REDIS_URL", "");
    const bodies: string[] = [];
    for (let i = 0; i < PER_EMAIL_CAPACITY + 1; i++) bodies.push(await (await post("victim@x.io")).text());
    await settle();
    expect(requestPasswordReset).toHaveBeenCalledTimes(PER_EMAIL_CAPACITY);
    expect(new Set(bodies).size).toBe(1); // identical response every time — throttling is not observable
  });

  it("answers the same bytes for a throttled address and a fresh one", async () => {
    vi.stubEnv("REDIS_URL", "");
    for (let i = 0; i < PER_EMAIL_CAPACITY; i++) await post("hot@x.io");
    const throttled = await (await post("hot@x.io")).text();
    const fresh = await (await post("cold@x.io")).text();
    expect(throttled).toBe(fresh);
  });
});
