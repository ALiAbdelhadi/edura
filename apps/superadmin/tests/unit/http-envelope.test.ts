import { describe, expect, it } from "vitest";
import { ok, fail } from "@/lib/http/envelope";

describe("envelope shim (superadmin)", () => {
  it("ok() wraps data", async () => {
    const res = ok({ x: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { x: 1 } });
  });

  it("fail() builds the error envelope", async () => {
    const res = fail(403, "forbidden", "no");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: "no" } });
  });
});
