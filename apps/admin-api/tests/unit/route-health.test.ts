import { describe, expect, it, vi } from "vitest";

const healthResponse = vi.fn();
vi.mock("@repo/server-core/http/health", () => ({
  healthResponse: (...a: unknown[]) => healthResponse(...(a as [])),
}));

const route = await import("../../src/routes/health/route");

describe("/api/health (admin-api)", () => {
  it("GET forwards the probe response (healthy)", async () => {
    healthResponse.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
  });

  it("HEAD mirrors the status and headers of an unhealthy probe, with no body", async () => {
    healthResponse.mockResolvedValue(
      new Response(JSON.stringify({ status: "unavailable" }), {
        status: 503,
        headers: { "retry-after": "30" },
      }),
    );
    const res = await route.HEAD();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.text()).toBe("");
  });
});
