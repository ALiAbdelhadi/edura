import { afterEach, describe, expect, it, vi } from "vitest";

const G = globalThis as never as { __DB_UP: boolean };
G.__DB_UP = true;

vi.mock("@repo/database", () => ({
  prisma: {
    $queryRaw: () =>
      (globalThis as never as { __DB_UP: boolean }).__DB_UP
        ? Promise.resolve([{ "?column?": 1 }])
        : Promise.reject(new Error("connection refused")),
  },
}));

import { healthResponse } from "@repo/server-core/http/health";
import { __resetRateLimiterForTests, checkRateLimit } from "@/lib/rate-limit/token-bucket";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
  G.__DB_UP = true;
});

const body = async () => (await healthResponse()).json();

describe("/api/health — rate-limiter visibility", () => {
  it("reports 'shared' when Redis is configured and healthy", async () => {
    vi.stubEnv("REDIS_URL", "redis://example.invalid:6379");
    __resetRateLimiterForTests(); // breaker closed, no failures recorded yet
    expect((await body()).rateLimiter).toBe("shared");
  });

  it("reports 'local' when REDIS_URL is unset — a deployment that forgot it looks the same as one that is down, and both mean unshared limits", async () => {
    vi.stubEnv("REDIS_URL", "");
    expect((await body()).rateLimiter).toBe("local");
  });

  it("reports 'local' once the breaker opens on an unreachable Redis", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399"); // closed port
    __resetRateLimiterForTests();
    expect((await body()).rateLimiter).toBe("shared"); // nothing has failed yet

    for (let i = 0; i < 4; i++) await checkRateLimit("health-probe", 100, 6000);
    expect((await body()).rateLimiter).toBe("local");
  }, 30_000);

  it("a degraded limiter never changes the status code or the `status` keyword", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399");
    __resetRateLimiterForTests();
    for (let i = 0; i < 4; i++) await checkRateLimit("health-probe-2", 100, 6000);

    const res = await healthResponse();
    const json = (await res.json()) as { status: string; db: string; rateLimiter: string };
    expect(json.rateLimiter).toBe("local");
    expect(res.status).toBe(200); // still serving
    expect(json.status).toBe("ok"); // monitors keyword-check this
    expect(res.headers.get("retry-after")).toBeNull();
  }, 30_000);

  it("the database still drives the status code, unaffected by the limiter", async () => {
    vi.stubEnv("REDIS_URL", "");
    G.__DB_UP = false;

    const res = await healthResponse();
    const json = (await res.json()) as { status: string; db: string; rateLimiter: string };
    expect(res.status).toBe(503);
    expect(json.status).toBe("degraded");
    expect(json.db).toBe("down");
    expect(json.rateLimiter).toBe("local"); // reported alongside, not conflated
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("leaks nothing new — the body is still exactly four known fields (rule 4)", async () => {
    vi.stubEnv("REDIS_URL", "");
    expect(Object.keys(await body()).sort()).toEqual(["db", "rateLimiter", "status", "time"]);
  });
});
