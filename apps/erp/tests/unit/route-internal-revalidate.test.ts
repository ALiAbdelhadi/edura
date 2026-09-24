import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expired = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => {
    expired.push(tag);
  },
}));

const { POST } = await import("@/app/api/v1/internal/revalidate/route");

const call = (body: unknown, secret?: string) =>
  POST(
    new Request("http://t.local/api/v1/internal/revalidate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-internal-secret": secret } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );

describe("POST /api/v1/internal/revalidate", () => {
  beforeEach(() => {
    expired.length = 0;
    vi.stubEnv("INTERNAL_API_SECRET", "s3cret-value-for-tests");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a caller without the secret, and expires nothing", async () => {
    expect((await call({ datasets: ["catalog"] })).status).toBe(403);
    expect((await call({ datasets: ["catalog"] }, "wrong")).status).toBe(403);
    expect(expired).toEqual([]);
  });

  it("accepts only the three public datasets — never an arbitrary tag", async () => {
    const res = await call({ datasets: ["wallet"] }, "s3cret-value-for-tests");
    expect(res.status).toBe(400);
    expect((await call({ datasets: [] }, "s3cret-value-for-tests")).status).toBe(400);
    expect(expired).toEqual([]);
  });

  it("expires the named datasets under their real tags", async () => {
    const res = await call({ datasets: ["catalog", "discovery", "catalog"] }, "s3cret-value-for-tests");
    expect(res.status).toBe(200);
    expect(expired).toEqual(["catalog", "discovery"]);
  });
});
