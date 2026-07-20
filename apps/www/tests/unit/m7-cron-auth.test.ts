import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M7 — cron endpoint must fail closed (require CRON_SECRET in EVERY env, no
// bypass) and must not run side-effectful jobs on a plain GET.
//
// The five job services are mocked so the "authorized → runs" case proves
// dispatch without touching the DB, and so an accidental unauthorized call
// could never silently run a real job.

const { runMonthEndStatements } = vi.hoisted(() => ({
  runMonthEndStatements: vi.fn(async () => ({ ran: "month-end-statements" })),
}));
vi.mock("@/lib/services/cron/jobs", () => ({
  runMonthEndStatements,
  runLessonReminders: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/payments/payment-intents", () => ({
  expirePaymentIntents: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/subscriptions/subscriptions", () => ({
  expireSubscriptions: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/collaboration/collaboration", () => ({
  expireCollaborationRequests: vi.fn(async () => ({})),
}));

import * as route from "@/app/api/v1/cron/[job]/route";

const ctx = (job: string) => ({ params: Promise.resolve({ job }) });
const post = (headers?: Record<string, string>) =>
  new Request("http://localhost/api/v1/cron/month-end-statements", {
    method: "POST",
    headers,
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("M7 — cron fails closed with no valid secret, in every env", () => {
  for (const env of ["production", "development", "test"] as const) {
    it(`${env}: CRON_SECRET UNSET → rejected, no job runs`, async () => {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("CRON_SECRET", "");

      const res = await route.POST(post(), ctx("month-end-statements"));
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(401);
      expect(body.error.code).toBe("unauthenticated");
      expect(runMonthEndStatements).not.toHaveBeenCalled();
    });
  }

  it("wrong secret → rejected, no job runs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "correct-secret");

    const res = await route.POST(
      post({ "x-cron-secret": "guessed" }),
      ctx("month-end-statements"),
    );

    expect(res.status).toBe(401);
    expect(runMonthEndStatements).not.toHaveBeenCalled();
  });
});

describe("M7 — correct secret runs the job", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "correct-secret");
  });

  it("via Authorization: Bearer <secret>", async () => {
    const res = await route.POST(
      post({ authorization: "Bearer correct-secret" }),
      ctx("month-end-statements"),
    );
    const body = (await res.json()) as { data: { ran: string } };

    expect(res.status).toBe(200);
    expect(body.data.ran).toBe("month-end-statements");
    expect(runMonthEndStatements).toHaveBeenCalledTimes(1);
  });

  it("via x-cron-secret header", async () => {
    const res = await route.POST(
      post({ "x-cron-secret": "correct-secret" }),
      ctx("month-end-statements"),
    );
    expect(res.status).toBe(200);
    expect(runMonthEndStatements).toHaveBeenCalledTimes(1);
  });
});

describe("M7 — no GET alias: a plain GET cannot trigger a job", () => {
  it("the route exports no GET handler (Next → 405), only POST", () => {
    // GET is intentionally not exported (removing the `GET = POST` alias), so
    // access it dynamically — a static `route.GET` would be a compile error,
    // which is itself the guarantee we want.
    expect((route as Record<string, unknown>).GET).toBeUndefined();
    expect(typeof route.POST).toBe("function");
  });
});
