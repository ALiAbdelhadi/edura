import { describe, expect, it } from "vitest";
import { ok, fail } from "@repo/server-core/http/envelope";

describe("ok()", () => {
  it("wraps data with status 200 by default", async () => {
    const res = ok({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { a: 1 } });
  });

  it("honours a custom status and meta", async () => {
    const res = ok({ id: "x" }, { status: 201, meta: { total: 5 } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: "x" }, meta: { total: 5 } });
  });

  it("serializes Date to ISO strings, recursively", async () => {
    const d = new Date("2026-08-08T10:00:00.000Z");
    const res = ok({ createdAt: d, nested: [{ at: d }], plain: 3 });
    expect(await res.json()).toEqual({
      data: {
        createdAt: "2026-08-08T10:00:00.000Z",
        nested: [{ at: "2026-08-08T10:00:00.000Z" }],
        plain: 3,
      },
    });
  });

  it("passes null/undefined/primitives through", async () => {
    expect(await ok(null).json()).toEqual({ data: null });
    expect(await ok("s").json()).toEqual({ data: "s" });
  });
});

describe("cacheability", () => {
  it("marks every success response no-store", () => {
    expect(ok({ a: 1 }).headers.get("cache-control")).toBe("no-store");
    expect(ok({ a: 1 }, { status: 201 }).headers.get("cache-control")).toBe("no-store");
    expect(ok(null, { meta: { total: 0 } }).headers.get("cache-control")).toBe("no-store");
  });

  it("marks every refusal no-store too", () => {
    expect(fail(403, "forbidden", "no").headers.get("cache-control")).toBe("no-store");
    expect(fail(401, "unauthenticated", "no").headers.get("cache-control")).toBe("no-store");
    expect(fail(500, "internal", "no").headers.get("cache-control")).toBe("no-store");
  });

  it("no-store, not merely no-cache or private", () => {
    const value = ok({ a: 1 }).headers.get("cache-control") ?? "";
    expect(value).toMatch(/\bno-store\b/);
  });
});

describe("fail()", () => {
  it("builds the error envelope with status, code, message", async () => {
    const res = fail(403, "forbidden", "no");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: "no" } });
  });

  it("merges extra fields into the error object (fields, details)", async () => {
    const res = fail(400, "validation_error", "bad", {
      fields: { name: ["required"] },
      details: { hint: "x" },
    });
    expect(await res.json()).toEqual({
      error: {
        code: "validation_error",
        message: "bad",
        fields: { name: ["required"] },
        details: { hint: "x" },
      },
    });
  });
});
