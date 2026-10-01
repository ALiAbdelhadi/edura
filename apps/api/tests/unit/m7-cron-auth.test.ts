import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runMonthEndStatements } = vi.hoisted(() => ({
  runMonthEndStatements: vi.fn(async () => ({ ran: "month-end-statements" })),
}));
vi.mock("@repo/server-core/services/cron/jobs", () => ({
  runMonthEndStatements,
  runLessonReminders: vi.fn(async () => ({})),
}));
vi.mock("@repo/server-core/services/payments/payment-intents", () => ({
  expirePaymentIntents: vi.fn(async () => ({})),
}));
vi.mock("@repo/server-core/services/subscriptions/subscriptions", () => ({
  expireSubscriptions: vi.fn(async () => ({})),
}));
vi.mock("@repo/server-core/services/collaboration/collaboration", () => ({
  expireCollaborationRequests: vi.fn(async () => ({})),
}));

import * as route from "../../src/routes/v1/cron/[job]/route";

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
    expect((route as Record<string, unknown>).GET).toBeUndefined();
    expect(typeof route.POST).toBe("function");
  });
});
