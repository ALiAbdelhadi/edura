import { describe, expect, it } from "vitest";
import { ok, fail } from "@/lib/http/envelope";

// The ok/fail envelope is the response contract of all ~400 route handlers.
// These tests pin the wire shape so a refactor of the serializer cannot
// silently change what every client parses.

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

// ---------------------------------------------------------------------------
// Cacheability. Every body this envelope builds is scoped to the caller's
// session — `GET /api/v1/me` literally answers "who am I". A 200 with no cache
// directive may be stored and replayed by anything between the server and the
// reader, which is how one family's screen reaches a different person. The
// routes being force-dynamic stops NEXT from caching; it says nothing to a CDN,
// a corporate proxy, or the browser's own heuristic freshness.
//
// Asserted here rather than trusted, because the header is invisible in every
// screenshot and in every response body: nothing about the app looks different
// the day it goes missing. See docs/reports/session-identity-mismatch.md.
// ---------------------------------------------------------------------------
describe("cacheability", () => {
  it("marks every success response no-store", () => {
    expect(ok({ a: 1 }).headers.get("cache-control")).toBe("no-store");
    expect(ok({ a: 1 }, { status: 201 }).headers.get("cache-control")).toBe("no-store");
    expect(ok(null, { meta: { total: 0 } }).headers.get("cache-control")).toBe("no-store");
  });

  it("marks every refusal no-store too", () => {
    // A refusal names the reason a specific caller was refused; a cached 403
    // would also outlive the condition that caused it.
    expect(fail(403, "forbidden", "no").headers.get("cache-control")).toBe("no-store");
    expect(fail(401, "unauthenticated", "no").headers.get("cache-control")).toBe("no-store");
    expect(fail(500, "internal", "no").headers.get("cache-control")).toBe("no-store");
  });

  it("no-store, not merely no-cache or private", () => {
    // `no-cache` permits STORING the response and only demands revalidation;
    // `private` permits the browser to keep it, which on a shared machine is
    // the next signed-in user. Only `no-store` forbids writing the copy.
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
